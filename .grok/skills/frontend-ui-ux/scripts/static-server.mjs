#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';

const entry = resolve(process.argv[2] || '');
const root = dirname(entry);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
try { if (!statSync(entry).isFile() || extname(entry).toLowerCase() !== '.html') throw new Error(); }
catch { process.stdout.write('BLOCKED: no entry page found\n'); process.exit(2); }
const server = createServer((req, res) => {
  let path;
  try { path = resolve(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || entry.split(sep).at(-1)); }
  catch { res.writeHead(400).end(); return; }
  if (path !== entry && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { const bytes = readFileSync(path); res.writeHead(200, { 'Content-Type': types[extname(path).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; form-action 'none'" }).end(bytes); }
  catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`http://127.0.0.1:${server.address().port}/${encodeURIComponent(entry.split(sep).at(-1))}\n`));
