// What a person at a terminal sees during `litgrok install` and `litgrok uninstall`: the ground-rules
// question as a card, the steps as a card that folds to one row, and a closing card. cardTerminal() decides;
// every other run (a pipe, CI, --yes, a preview, TERM=dumb, a tiny window) keeps the plain text in litgrok.mjs.
//
// Round caps are asked for once, as the status line asks, and every pill, chip and button end follows that answer.
// Without them the same cells are filled instead, so no width ever changes.

import { emitKeypressEvents } from 'node:readline';
import { drawsRoundCaps } from '../.grok/hooks/lit-caps.mjs';
import { terminalMode, unicodeTerminal } from '../.grok/hooks/lit-mark.mjs';

const SMALLEST = Object.freeze({ columns: 40, rows: 12 });
const WIDEST_CARD = 100;
// Every value starts in this column, under a folded answer's label, a step's name and a closing card's label alike.
const VALUE_COLUMN = 24;
const BUTTON_CELLS = 15;
const SETTLE_MS = 30;
const PLAIN_TERMS = /^(?:ansi|cygwin|linux|rxvt|screen|vt\d+|xterm)$/u;

// [r, g, b, 16-colour foreground code]
const PINK = [255, 45, 149, 95];
const VIOLET = [180, 140, 255, 94];
const ACCENT = [255, 99, 55, 91];
const ORANGE = [255, 143, 60, 93];
const GREEN = [80, 230, 140, 92];
const RED = [255, 85, 119, 91];
const AMBER = [255, 176, 46, 93];
const INK = [11, 14, 20, 30];
const BORDER = Object.freeze([PINK, VIOLET, ACCENT]);

const UNICODE = Object.freeze({
  corners: '╭╮╰╯', across: '─', down: '│', ok: '✓', failed: '✗', warning: '!', note: '·', dot: '·', pointer: '❯', arrows: '← →',
  chosen: '╔═╗║╚═╝', other: '╭─╮│╰─╯',
});
const ASCII = Object.freeze({
  corners: '++++', across: '-', down: '|', ok: 'ok', failed: 'x', warning: '!', note: '-', dot: '-', pointer: '>', arrows: 'Left Right',
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
    if (/[\p{Mark}\p{Cf}]/u.test(character)) continue;
    total += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(character) ? 2 : 1;
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

// A terminal that names a light background keeps square ends, as the status line does.
function lightBackground(env) {
  return /(?:^|;)(?:7|15)$/u.test(env.COLORFGBG ?? '');
}

export function createCards({ stdin, stdout, env, host = process, settleMs = SETTLE_MS }) {
  const depth = colorDepth(env, stdout);
  const ascii = !unicodeTerminal(env);
  const sign = ascii ? ASCII : UNICODE;
  const round = depth === 'truecolor' && !ascii && !lightBackground(env) && drawsRoundCaps(env);
  // Rows stand together while answers fold; any other block starts after one blank row.
  let lastBlock = 'text';

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

  // Filled text. The first and last cell are round caps, or filled like the rest: the same width either way.
  function chip(text, stops) {
    if (depth === 'none') return `[${text}]`;
    const fill = (back) => ({ color: INK, back, bold: true });
    if (!round) return gradient(` ${text} `, stops, fill);
    const span = cellsOf(text) + 2;
    return paint('\ue0b6', { color: stops[0] }) + gradient(text, stops, fill, 1, span) + paint('\ue0b4', { color: stops.at(-1) });
  }

  function card({ tag = 'LIT', title, body, failed = false }) {
    const width = cardCells();
    const stops = failed ? [RED, RED] : BORDER;
    const edge = (text, from) => gradient(text, stops, (color) => ({ color }), from, width);
    const [topLeft, topRight, bottomLeft, bottomRight] = sign.corners;
    const badge = chip(tag, [ORANGE, PINK]);
    const name = say(title);
    const onBorder = cellsOf(badge) + cellsOf(name) + 9 <= width;
    const head = onBorder ? ` ${badge} ${quiet(sign.dot)} ${bold(name)} ` : ` ${badge} `;
    const used = 2 + cellsOf(head);
    const lines = onBorder ? body : [...wrapCells(name, width - 4).map(bold), ...body];
    return [
      ` ${edge(topLeft + sign.across, 0)}${head}${edge(sign.across.repeat(width - used - 1) + topRight, used)}`,
      ...lines.map((line) => ` ${edge(sign.down, 0)} ${padTo(line, width - 4)} ${edge(sign.down, width - 1)}`),
      ` ${edge(bottomLeft + sign.across.repeat(width - 2) + bottomRight, 0)}`,
    ];
  }

  function markFor(status) {
    const color = { ok: GREEN, failed: RED, warning: AMBER }[status] ?? VIOLET;
    return paint(sign[status] ?? sign.note, { color, bold: true });
  }

  // A finished line: mark, label, value. A long value wraps under itself.
  function foldedRow(status, label, value) {
    const start = ` ${padTo(markFor(status), cellsOf(sign.ok))} ${say(label)}`;
    const lead = cellsOf(start) < VALUE_COLUMN && columns() >= VALUE_COLUMN * 2 ? padTo(start, VALUE_COLUMN) : `${start} `;
    return wrapCells(say(value), Math.max(12, columns() - 1 - cellsOf(lead)))
      .map((line, index) => `${index === 0 ? lead : ' '.repeat(cellsOf(lead))}${paint(line, { color: status === 'failed' ? RED : undefined, bold: true })}`)
      .join('\n');
  }

  function fold(status, label, value) {
    const gap = lastBlock === 'fold' ? '' : '\n';
    lastBlock = 'fold';
    return `${gap}${foldedRow(status, label, value)}\n`;
  }

  function buttons({ yes, initial, small }) {
    const roomy = innerCells() >= 44;
    const suffix = roomy ? ' (default)' : ' default';
    const labelCells = roomy ? BUTTON_CELLS : 5 + suffix.length;
    const pair = [true, false].map((value) => {
      const chosen = value === yes;
      const label = padTo(`${chosen ? sign.pointer : ' '} ${value ? 'Yes' : 'No'}${value === initial ? suffix : ''}`, labelCells);
      const lit = chosen ? chip(label, [PINK, VIOLET]) : ` ${label} `;
      if (small) return [chosen ? lit : quiet(lit)];
      const filled = chosen && depth !== 'none' && !ascii;
      const [a, b, c, side, d, e, f] = chosen && !filled ? sign.chosen : sign.other;
      const span = labelCells + 6;
      const style = (text, from) => (chosen ? gradient(text, [PINK, VIOLET], (color) => ({ color, bold: !filled }), from, span) : quiet(text));
      const middle = filled ? lit : ` ${chosen ? bold(label) : label} `;
      return [
        style(a + b.repeat(span - 2) + c, 0),
        `${style(side, 0)} ${middle} ${style(side, span - 1)}`,
        style(d + e.repeat(span - 2) + f, 0),
      ];
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

  // Roomy when the window allows it, then without its blank rows, then with one-line buttons.
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
      { body: ['', ...noteLines, '', ...big, '', ...hints] },
      { body: [...noteLines, ...big, ...hints] },
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
      // A row that did not change is stepped over, so a key press redraws the buttons and the hint only.
      const same = (row, index) => from === onScreen.length && next.length === onScreen.length && row === onScreen[index];
      stdout.write(`${up(from)}\r${next.map((row, index) => (same(row, index) ? '\r\n' : `${row}\u001b[K\r\n`)).join('')}\u001b[J`);
      onScreen = next;
    };
    const close = (row) => {
      stdout.write(`${up(onScreen.length)}\r\u001b[J${row}`);
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
            onScreen = [];
            draw();
          });
          host.kill(0, 'SIGTSTP');
        };
        emitKeypressEvents(stdin);
        listen(stdin, 'keypress', onKey);
        listen(stdin, 'end', () => reject(new Error('The terminal closed: nothing was changed')));
        listen(stdout, 'resize', () => {
          // Rows drawn for the old width may have wrapped: step over what they take up now.
          const taken = onScreen.reduce((sum, row) => sum + Math.max(1, Math.ceil(cellsOf(row) / columns())), 0);
          if (!ready) return;
          const from = Math.min(taken, rows() - 1);
          onScreen = [];
          draw(from);
        });
        setTimeout(() => {
          if (stopKey !== null) return;
          ready = true;
          draw();
        }, settleMs);
      });
      close(fold('ok', title, answer ? yesText : noText));
      return answer;
    } catch (error) {
      close(fold('failed', title, 'stopped'));
      throw error;
    } finally {
      for (const remove of listeners) remove();
      release();
      // The whole job, as the terminal itself would: a launcher or script around the installer stops too.
      if (stopKey === 'Ctrl+C') host.kill(0, 'SIGINT');
    }
  }

  /**
   * The steps as one card that is redrawn in place. The steps run without a pause between them, so nothing spins.
   * A run that stopped part way keeps the card; a finished one folds to a row.
   */
  function work({ title, steps }) {
    const states = steps.map(({ name, text }) => ({ name, text, status: 'waiting' }));
    let onScreen = [];
    const lines = () => {
      const valueCells = innerCells() - (VALUE_COLUMN - 3);
      const longest = Math.max(...states.map(({ name }) => cellsOf(name)));
      // One column for every step's text: the family column, or just past the longest name in a narrow window.
      const start = Math.max(...states.map(({ text }) => cellsOf(say(text)))) <= valueCells ? VALUE_COLUMN - 5 : longest + 2;
      return states.flatMap(({ name, text, status }) => {
        const mark = status === 'waiting' ? quiet(sign.note) : markFor(status);
        const lead = `${padTo(mark, 2)}${padTo(status === 'waiting' ? quiet(name) : bold(name), start)}`;
        const room = innerCells() - cellsOf(lead);
        if (status === 'failed') {
          return wrapCells(say(text), room).map((line, index) => `${index === 0 ? lead : ' '.repeat(cellsOf(lead))}${paint(line, { color: RED, bold: true })}`);
        }
        const value = say(text);
        return [cellsOf(value) <= room ? lead + (status === 'waiting' ? quiet(value) : value) : lead.trimEnd()];
      });
    };
    const draw = () => {
      const next = [...(lastBlock === 'card' ? [] : ['']), ...card({ title, body: ['', ...lines()] })];
      const fits = next.length < rows();
      if (!fits && onScreen.length === 0) return;
      const back = onScreen.length > 0 ? `\u001b[${onScreen.length}A` : '';
      stdout.write(`${back}\r${next.map((row, index) => (onScreen[index] === row ? '\r\n' : `${row}\u001b[K\r\n`)).join('')}`);
      onScreen = next;
    };
    return {
      open: draw,
      finish(status, name, text) {
        Object.assign(states.find((state) => state.name === name), { status, text });
        draw();
      },
      close({ warnings = 0 } = {}) {
        if (states.some(({ status }) => status === 'failed' || status === 'waiting')) {
          lastBlock = 'text';
          return;
        }
        const back = onScreen.length > 0 ? `\u001b[${onScreen.length}A\r\u001b[J` : '';
        const note = warnings > 0 ? ` · ${warnings} warning${warnings === 1 ? '' : 's'} below` : '';
        stdout.write(`${back}${fold(warnings > 0 ? 'warning' : 'ok', 'Install steps', `${states.length} of ${states.length} checked${note}`)}`);
      },
    };
  }

  /** The closing card. `sections` are { head, rows: [{ status, label, value }] }; every value is wrapped in full. */
  function summary({ title, sections, failed = false }) {
    const stacked = innerCells() < 56;
    const body = [];
    for (const section of sections) {
      body.push('', paint(section.head, { color: failed ? RED : PINK, bold: true }));
      for (const { status = 'note', label, value } of section.rows) {
        const mark = padTo(markFor(status), 2);
        const strong = status === 'failed' || status === 'warning';
        const shown = (line) => (strong ? paint(line, { color: status === 'failed' ? RED : undefined, bold: true }) : line);
        const start = stacked ? '' : padTo(mark + bold(say(label)), Math.max(VALUE_COLUMN - 3, cellsOf(mark + label) + 1));
        const indent = stacked ? 2 : cellsOf(start);
        const lines = wrapCells(say(value), innerCells() - indent);
        if (stacked) body.push(mark + bold(say(label)));
        lines.forEach((line, index) => body.push((index === 0 && !stacked ? start : ' '.repeat(indent)) + shown(line)));
      }
    }
    stdout.write(`\n${card({ title, body, failed }).join('\n')}\n`);
    lastBlock = 'card';
  }

  /** One dim line or more under the mark, wrapped to the cards' width. */
  function intro(line) {
    stdout.write(`\n${wrapCells(say(line), cardCells()).map((part) => ` ${quiet(part)}\n`).join('')}`);
    lastBlock = 'text';
  }

  /** The mark, and the product's name under it, centred over the cards. */
  function banner(mark, name) {
    const centred = (lines) => {
      const indent = ' '.repeat(Math.max(0, 1 + Math.floor((cardCells() - Math.max(...lines.map(cellsOf))) / 2)));
      return lines.map((line) => `${indent}${line}\n`).join('');
    };
    stdout.write(`\n${centred(mark)}${centred(wrapCells(say(name), cardCells()))}`);
  }

  /** Plain wrapped text under the cards with a bold heading. A { command } line is never wrapped. */
  function text(lines, heading) {
    stdout.write(`\n ${bold(say(heading))}\n`);
    for (const line of lines) {
      if (line.command) {
        stdout.write(`     ${line.command}\n`);
        continue;
      }
      for (const part of wrapCells(say(line), cardCells() - 2)) stdout.write(`   ${part}\n`);
    }
    lastBlock = 'text';
  }

  return { banner, confirm, intro, summary, text, work };
}
