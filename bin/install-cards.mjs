// What a person at a terminal sees during `litgrok install` and `litgrok uninstall`: the ground-rules
// question as a card, one row per finished step, and a closing card. cardTerminal() decides; every other
// run (a pipe, CI, --yes, a preview, TERM=dumb, a tiny window) keeps the plain text in litgrok.mjs.

import { emitKeypressEvents } from 'node:readline';
import { terminalMode, unicodeTerminal } from '../.grok/hooks/lit-mark.mjs';

const SMALLEST = Object.freeze({ columns: 40, rows: 12 });
const WIDEST_CARD = 100;
const LABEL_CELLS = 16;
const SETTLE_MS = 30;
const PLAIN_TERMS = /^(?:ansi|cygwin|linux|rxvt|screen|vt\d+|xterm)$/u;

// [r, g, b, 16-colour foreground code]
const PINK = [255, 45, 149, 95];
const VIOLET = [167, 139, 250, 94];
const ORANGE = [255, 99, 55, 91];
const GOLD = [255, 170, 60, 93];
const GREEN = [80, 200, 80, 92];
const RED = [230, 60, 60, 91];
const INK = [12, 10, 24, 30];
const BORDER = Object.freeze([PINK, VIOLET, ORANGE]);

const UNICODE = Object.freeze({
  corners: '╭╮╰╯', across: '─', down: '│', ok: '✓', failed: '✗', skipped: '○', note: '·', pointer: '❯', arrows: '← →',
  chosen: '╔═╗║╚═╝', other: '╭─╮│╰─╯',
});
const ASCII = Object.freeze({
  corners: '++++', across: '-', down: '|', ok: 'ok', failed: 'x', skipped: '-', note: '-', pointer: '>', arrows: 'Left Right',
  chosen: '#=###=#', other: '+-+|+-+',
});
const ASCII_WORDS = Object.freeze({ '·': '-', '→': '->', '—': '-', '…': '...' });

export function cardTerminal({ stdin, stdout, env }) {
  return Boolean(stdin?.isTTY && stdout?.isTTY)
    && typeof stdin.setRawMode === 'function'
    && !Object.hasOwn(env, 'CI')
    && !Object.hasOwn(env, 'LITGROK_GROUND')
    && !/^dumb$/iu.test(env.TERM ?? '')
    && (stdout.columns || 80) >= SMALLEST.columns
    && (stdout.rows || 24) >= SMALLEST.rows;
}

function withoutEscapes(text) {
  return text.replace(/\u001b\[[0-9;]*m/gu, '');
}

function cellsOf(text) {
  let total = 0;
  for (const character of withoutEscapes(text)) {
    if (/[\p{Mark}‍]/u.test(character)) continue;
    total += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(character) ? 2 : 1;
  }
  return total;
}

function padTo(text, cells) {
  return text + ' '.repeat(Math.max(0, cells - cellsOf(text)));
}

// Wraps at spaces. A word longer than the line (a path) runs on to the next line; nothing is dropped.
export function wrapCells(text, cells) {
  const lines = [''];
  for (const word of String(text).split(/\s+/u).filter(Boolean)) {
    const line = lines.at(-1);
    if (line !== '' && cellsOf(line) + 1 + cellsOf(word) <= cells) {
      lines[lines.length - 1] = `${line} ${word}`;
      continue;
    }
    if (line !== '') lines.push('');
    for (const character of word) {
      if (cellsOf(lines.at(-1) + character) > cells) lines.push('');
      lines[lines.length - 1] += character;
    }
  }
  return lines;
}

function colorDepth(env, stdout) {
  const mode = terminalMode({ env, isTTY: stdout.isTTY });
  if (mode === '256' && PLAIN_TERMS.test(env.TERM ?? '')) return '16';
  return mode;
}

function cubeStep(value) {
  return value < 48 ? 0 : value < 115 ? 1 : Math.min(5, Math.floor((value - 35) / 40));
}

function colorCode([red, green, blue, basic], layer, depth) {
  if (depth === '16') return String(basic + (layer === 'back' ? 10 : 0));
  const lead = layer === 'back' ? 48 : 38;
  if (depth === 'truecolor') return `${lead};2;${red};${green};${blue}`;
  return `${lead};5;${16 + 36 * cubeStep(red) + 6 * cubeStep(green) + cubeStep(blue)}`;
}

function between(stops, at) {
  const position = Math.max(0, Math.min(1, at)) * (stops.length - 1);
  const left = Math.min(stops.length - 2, Math.floor(position));
  const part = position - left;
  const mixed = [0, 1, 2].map((index) => Math.round(stops[left][index] + (stops[left + 1][index] - stops[left][index]) * part));
  return [...mixed, stops[Math.round(position)][3]];
}

export function createCards({ stdin, stdout, env, host = process, settleMs = SETTLE_MS }) {
  const depth = colorDepth(env, stdout);
  const ascii = !unicodeTerminal(env);
  const sign = ascii ? ASCII : UNICODE;

  const columns = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;
  const cardCells = () => Math.min(WIDEST_CARD, columns() - 2);
  const innerCells = () => cardCells() - 4;
  const say = (text) => (ascii ? String(text).replace(/[·→—…]/gu, (found) => ASCII_WORDS[found]) : String(text));

  function paint(text, { color, back, bold, dim } = {}) {
    if (depth === 'none' || text === '') return text;
    const codes = [];
    if (bold) codes.push('1');
    if (dim) codes.push('2');
    if (color) codes.push(colorCode(color, 'front', depth));
    if (back) codes.push(colorCode(back, 'back', depth));
    return `\u001b[${codes.join(';')}m${text}\u001b[0m`;
  }

  const bold = (text) => paint(text, { bold: true });
  const quiet = (text) => paint(text, { dim: true });

  // Paints `text` along `stops`. `from` and `span` place it on a longer run, so a border split by its
  // title keeps one gradient. Cells that land on the same step share one escape.
  function gradient(text, stops, style, from = 0, span = [...text].length) {
    if (depth === 'none') return text;
    let output = '';
    let run = '';
    let runStep = null;
    const flush = () => {
      if (run !== '') output += paint(run, style(between(stops, runStep / 20)));
      run = '';
    };
    [...text].forEach((character, index) => {
      const step = Math.round(((from + index) / Math.max(1, span - 1)) * 20);
      if (step !== runStep) flush();
      runStep = step;
      run += character;
    });
    flush();
    return output;
  }

  function pill(text) {
    if (depth === 'none') return `[${text}]`;
    return gradient(` ${text} `, [GOLD, ORANGE, PINK], (back) => ({ color: INK, back, bold: true }));
  }

  function card({ tag = 'LIT', title, body, failed = false }) {
    const width = cardCells();
    const stops = failed ? [RED, RED] : BORDER;
    const edge = (text, from) => gradient(text, stops, (color) => ({ color }), from, width);
    const [topLeft, topRight, bottomLeft, bottomRight] = sign.corners;
    const badge = pill(tag);
    const name = say(title);
    const onBorder = cellsOf(badge) + cellsOf(name) + 8 <= width;
    const head = onBorder ? `${badge} ${bold(name)} ` : badge;
    const used = 2 + cellsOf(head);
    const lines = onBorder ? body : [...wrapCells(name, width - 4).map(bold), ...body];
    return [
      ` ${edge(topLeft + sign.across, 0)}${head}${edge(sign.across.repeat(width - used - 1) + topRight, used)}`,
      ...lines.map((line) => ` ${edge(sign.down, 0)} ${padTo(line, width - 4)} ${edge(sign.down, width - 1)}`),
      ` ${edge(bottomLeft + sign.across.repeat(width - 2) + bottomRight, 0)}`,
    ];
  }

  function markFor(status) {
    if (status === 'ok') return paint(sign.ok, { color: GREEN, bold: true });
    if (status === 'failed') return paint(sign.failed, { color: RED, bold: true });
    return paint(status === 'skipped' ? sign.skipped : sign.note, { color: VIOLET, bold: true });
  }

  // A finished line: mark, label, value. A long value wraps under itself.
  function foldedRow(status, label, value) {
    const lead = ` ${padTo(markFor(status), cellsOf(sign.ok))} ${padTo(say(label), LABEL_CELLS)}`;
    const indent = ' '.repeat(cellsOf(lead));
    return wrapCells(say(value), Math.max(12, columns() - 1 - cellsOf(lead)))
      .map((line, index) => `${index === 0 ? lead : indent}${status === 'failed' ? paint(line, { color: RED, bold: true }) : line}`)
      .join('\n');
  }

  function buttons({ yes, initial, small }) {
    const suffix = innerCells() >= 44 ? ' (default)' : ' default';
    const labelCells = 5 + suffix.length;
    const pair = [true, false].map((value) => {
      const chosen = value === yes;
      const label = padTo(`${chosen ? sign.pointer : ' '} ${value ? 'Yes' : 'No'}${value === initial ? suffix : ''}`, labelCells);
      if (small) {
        if (!chosen) return [` ${label} `];
        return [depth === 'none' ? `[${label}]` : gradient(` ${label} `, [PINK, VIOLET], (back) => ({ color: INK, back, bold: true }))];
      }
      if (chosen && depth !== 'none' && !ascii) {
        const face = `  ${label}  `;
        const lip = (glyph) => gradient(glyph.repeat(face.length), [PINK, VIOLET], (color) => ({ color }));
        return [lip('▄'), gradient(face, [PINK, VIOLET], (back) => ({ color: INK, back, bold: true })), lip('▀')];
      }
      const [a, b, c, side, d, e, f] = chosen ? sign.chosen : sign.other;
      const style = chosen ? (text) => paint(text, { color: PINK, bold: true }) : quiet;
      const middle = `${style(side)} ${chosen ? bold(label) : label} ${style(side)}`;
      return [style(a + b.repeat(labelCells + 2) + c), middle, style(d + e.repeat(labelCells + 2) + f)];
    });
    return pair[0].map((left, index) => `${left}  ${pair[1][index]}`);
  }

  // Key hints, as many to a line as fit; one hint is never split.
  function hintLines(hints) {
    const lines = [];
    for (const hint of hints) {
      const joined = lines.length > 0 ? `${lines.at(-1)}   ${hint}` : hint;
      if (lines.length > 0 && cellsOf(joined) <= innerCells()) lines[lines.length - 1] = joined;
      else lines.push(hint);
    }
    return lines.map(quiet);
  }

  // Roomy when the window allows it, then without blank lines, then with one-line buttons.
  function questionRows({ tag, title, note, initial, yes }) {
    const noteLines = wrapCells(say(note), innerCells());
    const enter = `Enter = ${yes ? 'Yes' : 'No'}`;
    const hints = hintLines(['y / n answer', `${sign.arrows} switch`, enter, 'Ctrl+C stop']);
    const small = buttons({ yes, initial, small: true });
    const full = buttons({ yes, initial, small: false });
    const big = cellsOf(full[0]) <= innerCells() ? full : small;
    const heading = `${title} ${initial ? '[Y/n]' : '[y/N]'}`;
    let drawn;
    for (const { lead = [], body } of [
      { lead: [''], body: ['', ...noteLines, '', ...big, '', ...hints] },
      { lead: [''], body: [...noteLines, '', ...big, '', ...hints] },
      { body: [...noteLines, ...small, ...hints] },
      { body: [...noteLines, ...small, ...hintLines(['y / n', enter, 'Ctrl+C stop'])] },
    ]) {
      drawn = [...lead, ...card({ tag, title: heading, body })];
      if (drawn.length < rows()) return drawn;
    }
    return drawn.slice(-(rows() - 1));
  }

  /** Yes or no. Resolves to true or false; rejects when the person stops or the terminal closes. */
  async function confirm({ tag, title, note, initial, yesText = 'yes', noText = 'no' }) {
    let yes = initial;
    let onScreen = [];
    const cursor = (shown) => stdout.write(shown ? '\u001b[?25h' : '\u001b[?25l');
    const up = (count) => (count > 0 ? `\u001b[${count}A` : '');
    const draw = (from = onScreen.length) => {
      const next = questionRows({ tag, title, note, initial, yes });
      stdout.write(`${up(from)}\r${next.map((row) => `${row}\u001b[K\r\n`).join('')}\u001b[J`);
      onScreen = next;
    };
    const fold = (row) => {
      stdout.write(`${up(onScreen.length)}\r\u001b[J${row}\n`);
      onScreen = [];
    };

    let held = false;
    const hold = () => {
      held = true;
      stdin.setRawMode(true);
      stdin.resume();
      cursor(false);
    };
    const letGo = () => {
      if (!held) return;
      held = false;
      cursor(true);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const passOn = (signal) => {
      release();
      host.kill(host.pid, signal);
    };
    function release() {
      letGo();
      host.removeListener('exit', letGo);
      for (const signal of signals) host.removeListener(signal, passOn);
    }

    hold();
    host.on('exit', letGo);
    for (const signal of signals) host.on(signal, passOn);
    const listeners = [];
    const listen = (source, event, handler) => {
      source.on(event, handler);
      listeners.push(() => source.removeListener(event, handler));
    };
    let stopKey = null;
    try {
      const answer = await new Promise((accept, reject) => {
        const stop = (key) => {
          stopKey = key;
          reject(new Error(`Stopped with ${key}: nothing was changed`));
        };
        // Keys typed before the card is drawn were not meant for it; only Ctrl+C counts.
        let ready = false;
        const onKey = (text, key = {}) => {
          if (key.ctrl && key.name === 'c') return stop('Ctrl+C');
          if (!ready) return undefined;
          if (key.ctrl && key.name === 'd') return stop('Ctrl+D');
          if (key.ctrl && key.name === 'z' && host.platform !== 'win32') return suspend();
          if (key.ctrl || key.meta || key.name === 'escape') return undefined;
          if (key.name === 'return' || key.name === 'enter') return accept(yes);
          if (/^[yn]$/iu.test(text ?? '')) return accept(/^y$/iu.test(text));
          if (['left', 'right', 'tab'].includes(key.name)) {
            yes = !yes;
            draw();
          }
          return undefined;
        };
        // Ctrl+Z pauses the whole job as it does at a plain prompt; fg draws the card again.
        const suspend = () => {
          cursor(true);
          stdin.setRawMode(false);
          host.once('SIGCONT', () => {
            if (!held) return;
            stdin.setRawMode(true);
            cursor(false);
            draw(0);
          });
          host.kill(0, 'SIGTSTP');
        };
        emitKeypressEvents(stdin);
        listen(stdin, 'keypress', onKey);
        listen(stdin, 'end', () => reject(new Error('The terminal closed: nothing was changed')));
        listen(stdout, 'resize', () => {
          // Rows drawn for the old width may have wrapped: step over what they take up now.
          const taken = onScreen.reduce((sum, row) => sum + Math.max(1, Math.ceil(cellsOf(row) / columns())), 0);
          if (ready) draw(Math.min(taken, rows() - 1));
        });
        setTimeout(() => {
          if (stopKey !== null) return;
          ready = true;
          draw();
        }, settleMs);
      });
      fold(foldedRow('ok', title, answer ? yesText : noText));
      return answer;
    } catch (error) {
      fold(foldedRow('failed', title, 'stopped'));
      throw error;
    } finally {
      for (const remove of listeners) remove();
      release();
      // The whole job, as the terminal itself would: a launcher or script around the installer stops too.
      if (stopKey === 'Ctrl+C') host.kill(0, 'SIGINT');
    }
  }

  /** The closing card. `sections` are { head, rows: [{ status, label, value }] }; every value is wrapped in full. */
  function summary({ title, sections, failed = false }) {
    const markCells = cellsOf(sign.ok) + 1;
    const labelCells = 2 + Math.max(...sections.flatMap((section) => section.rows.map(({ label }) => cellsOf(label))));
    const stacked = innerCells() < 56;
    const body = [];
    for (const section of sections) {
      body.push('', paint(section.head, { color: failed ? RED : PINK, bold: true }));
      for (const { status = 'note', label, value } of section.rows) {
        const lead = padTo(markFor(status), markCells);
        const valueCells = innerCells() - markCells - (stacked ? 0 : labelCells);
        const lines = wrapCells(say(value), valueCells);
        if (stacked) {
          body.push(lead + bold(label), ...lines.map((line) => ' '.repeat(markCells) + line));
        } else {
          lines.forEach((line, index) => body.push(
            (index === 0 ? lead + padTo(bold(label), labelCells) : ' '.repeat(markCells + labelCells)) + line,
          ));
        }
      }
    }
    stdout.write(`\n${card({ title, body, failed }).join('\n')}\n\n`);
  }

  function step(status, label, value) {
    stdout.write(`${foldedRow(status, label, value)}\n`);
  }

  /** Plain wrapped text under the cards, optionally with a bold heading. */
  function text(lines, heading) {
    const room = Math.min(WIDEST_CARD, columns() - 2);
    if (heading) stdout.write(` ${bold(say(heading))}\n`);
    const indent = heading ? '   ' : ' ';
    for (const line of lines) {
      for (const part of wrapCells(say(line), room - indent.length)) stdout.write(`${indent}${heading ? part : quiet(part)}\n`);
    }
  }

  return { confirm, step, summary, text };
}
