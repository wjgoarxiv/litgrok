// The cover's review picture: twelve decoded frames above a plot of every grid step's frame
// difference across the whole loop (the still threshold dashed red, the median dotted green, any
// marked span shaded). A held picture is a flat run on the red line, an encoder pop is a regular
// spike, a reset is a spike at the right end: things single stills cannot show. The sheet is a
// small local page captured by the same Chrome the cover uses, so its labels are real type; the
// model opens the PNG with Grok's image viewing like any still.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COVER } from './constants.mjs';
import { openCover } from './cover-capture.mjs';
import { readPngRgba } from './cover-gate.mjs';

const esc = (s) => String(s).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The page for tiles [{ file, caption }] (four per row) and the plot of `diffs`.
export function sheetPage({ tiles, tileWidth, tileHeight, diffs, medianD, label, status, marks = [], durationSec }) {
  const pad = 8, cols = 4, caption = 22, plotH = 170;
  const rows = Math.ceil(tiles.length / cols);
  const width = cols * tileWidth + (cols + 1) * pad;
  const plotTop = rows * (tileHeight + caption + pad) + pad + 10;
  const height = plotTop + plotH + 40;
  const plotW = width - 2 * pad;
  const top = Math.max(0.01, ...diffs) * 1.05;
  const X = (i) => pad + (i / Math.max(1, diffs.length - 1)) * plotW;
  const Y = (v) => plotTop + plotH - (v / top) * plotH;
  const atSec = (s) => pad + (s / durationSec) * plotW;
  const cells = tiles.map((tile, k) => {
    const x = pad + (k % cols) * (tileWidth + pad);
    const y = pad + Math.floor(k / cols) * (tileHeight + caption + pad);
    return `<div class="cap" style="left:${x}px;top:${y}px">${esc(tile.caption)}</div><img src="${esc(tile.file)}" style="left:${x}px;top:${y + caption}px;width:${tileWidth}px;height:${tileHeight}px">`;
  }).join('\n');
  const shades = marks.map((m) => `<rect x="${atSec(m.t0).toFixed(1)}" y="${plotTop}" width="${Math.max(2, atSec(m.t1) - atSec(m.t0)).toFixed(1)}" height="${plotH}" fill="#ffb02e" opacity="0.18"/>`).join('');
  const line = diffs.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const page = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/lit/fonts.css">
<style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#080b10}
img{position:absolute;display:block}.cap{position:absolute;font:13px "JetBrains Mono",monospace;color:#9aa4ad}
.foot{position:absolute;left:${pad}px;top:${plotTop + plotH + 12}px;font:14px "JetBrains Mono",monospace;color:#d0d6dc;white-space:nowrap}</style>
<body>${cells}
<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0">
<rect x="${pad}" y="${plotTop}" width="${plotW}" height="${plotH}" fill="#11161d"/>${shades}
<line x1="${pad}" x2="${pad + plotW}" y1="${Y(COVER.stillEps)}" y2="${Y(COVER.stillEps)}" stroke="#b33" stroke-dasharray="4 4"/>
<line x1="${pad}" x2="${pad + plotW}" y1="${Y(medianD)}" y2="${Y(medianD)}" stroke="#5a8" stroke-dasharray="2 3"/>
<polyline points="${line}" fill="none" stroke="#ff7a46" stroke-width="1.5"/></svg>
<div class="foot">${esc(label)} | ${esc(status)}</div>
<script>window.renderFrame = () => {}; Promise.all([...document.images].map((i) => i.decode())).then(() => document.fonts.ready).then(() => { window.ready = true; });</script>`;
  return { page, width, height };
}

// Render the sheet to `file`. Tiles are PNG files on disk; they are copied beside the page (the
// cover origin serves nothing outside its folder) and `workDir` is removed afterwards.
export async function renderSheet({ file, tiles, diffs, medianD, label, status, marks, durationSec, fonts, workDir, env, log }) {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const first = readPngRgba(tiles[0].file);
  const tileWidth = 400;
  const tileHeight = Math.round((tileWidth * first.height) / first.width);
  const local = tiles.map((tile, i) => {
    const name = `t${String(i).padStart(2, '0')}.png`;
    copyFileSync(tile.file, join(workDir, name));
    return { file: name, caption: tile.caption };
  });
  const { page, width, height } = sheetPage({ tiles: local, tileWidth, tileHeight, diffs, medianD, label, status, marks, durationSec });
  writeFileSync(join(workDir, 'index.html'), page);
  const sheet = await openCover({ dir: workDir, fonts, width, height, scale: 1, profileRoot: workDir, env, label: 'sheet', log });
  try {
    await sheet.frame(0);
    writeFileSync(file, await sheet.capture());
  } finally {
    await sheet.close();
    rmSync(workDir, { recursive: true, force: true });
  }
  return file;
}
