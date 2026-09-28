#!/usr/bin/env node
import path from 'node:path';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { cleanLabel, decodeEntities, ImportFailure, readBounded, reject, safeId, sha256, writeJson } from './import-common.mjs';

const MAX_INPUT = 16 * 1024 * 1024;
const MAX_DECODED = 32 * 1024 * 1024;
const MAX_NODES = 2_000;
const MAX_EDGES = 5_000;
const MAX_DEPTH = 64;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SHAPE_ALIASES = [
  ['rhombus', 'diamond'], ['diamond', 'diamond'], ['ellipse', 'ellipse'], ['actor', 'ellipse'],
  ['cylinder', 'cylinder'], ['database', 'cylinder'], ['swimlane', 'container'], ['text', 'text'],
  ['group', 'group'], ['table', 'table'], ['hexagon', 'hexagon'], ['cloud', 'cloud'],
  ['parallelogram', 'parallelogram'], ['document', 'document'], ['image', 'image'],
];

function local(name) { return name.split(':').at(-1); }

function parseTag(tag) {
  let cursor = 0;
  const skip = () => { while (/\s/.test(tag[cursor] || '')) cursor += 1; };
  skip();
  const start = cursor;
  while (cursor < tag.length && /[A-Za-z0-9_:.-]/.test(tag[cursor])) cursor += 1;
  const name = tag.slice(start, cursor);
  if (!/^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(name)) reject('malformed XML element name');
  const attrs = {};
  while (cursor < tag.length) {
    skip();
    if (cursor >= tag.length || tag[cursor] === '/') break;
    const attrStart = cursor;
    while (cursor < tag.length && /[A-Za-z0-9_:.-]/.test(tag[cursor])) cursor += 1;
    const key = tag.slice(attrStart, cursor);
    if (!/^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(key)) reject('malformed XML attribute');
    skip();
    if (tag[cursor] !== '=') reject('XML attributes must have quoted values');
    cursor += 1;
    skip();
    const quote = tag[cursor];
    if (quote !== '"' && quote !== "'") reject('XML attributes must have quoted values');
    cursor += 1;
    const valueStart = cursor;
    while (cursor < tag.length && tag[cursor] !== quote) cursor += 1;
    if (cursor >= tag.length) reject('unterminated XML attribute');
    if (Object.hasOwn(attrs, key)) reject('duplicate XML attribute');
    attrs[key] = decodeEntities(tag.slice(valueStart, cursor));
    cursor += 1;
  }
  return { name, attrs, selfClosing: /\/\s*$/.test(tag) };
}

function parseXml(source) {
  if (Buffer.byteLength(source, 'utf8') > MAX_DECODED) reject('decoded draw.io page exceeds the size limit');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) reject('DTD and entity declarations are unsupported');
  const roots = [];
  const stack = [];
  let cursor = 0;
  let elements = 0;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open < 0) {
      if (stack.length) stack.at(-1).text += source.slice(cursor);
      break;
    }
    if (open > cursor && stack.length) stack.at(-1).text += source.slice(cursor, open);
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      if (end < 0) reject('unterminated XML comment');
      cursor = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open + 9);
      if (end < 0) reject('unterminated XML CDATA section');
      if (stack.length) stack.at(-1).text += source.slice(open + 9, end);
      cursor = end + 3;
      continue;
    }
    if (source.startsWith('<?', open)) {
      const end = source.indexOf('?>', open + 2);
      if (end < 0) reject('unterminated XML processing instruction');
      cursor = end + 2;
      continue;
    }
    let end = open + 1;
    let quote = '';
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= source.length || quote) reject('unterminated XML tag');
    const token = source.slice(open + 1, end).trim();
    if (token.startsWith('!')) reject('unsupported XML declaration');
    if (token.startsWith('/')) {
      const closing = token.slice(1).trim();
      if (!stack.length || stack.at(-1).name !== closing) reject('mismatched XML closing tag');
      stack.pop();
    } else {
      const item = parseTag(token);
      const node = { name: item.name, attrs: item.attrs, children: [], text: '' };
      if (stack.length) stack.at(-1).children.push(node);
      else roots.push(node);
      elements += 1;
      if (elements > 100_000) reject('XML element limit exceeded');
      if (!item.selfClosing) {
        stack.push(node);
        if (stack.length > MAX_DEPTH) reject('XML nesting exceeds the depth limit');
      }
    }
    cursor = end + 1;
  }
  if (stack.length) reject('unclosed XML element');
  if (roots.length !== 1) reject('XML must contain exactly one document element');
  return roots[0];
}

function boundedInflate(data, raw = false, label = 'embedded draw.io payload') {
  try {
    const decoded = raw
      ? inflateRawSync(data, { maxOutputLength: MAX_DECODED + 1 })
      : inflateSync(data, { maxOutputLength: MAX_DECODED + 1 });
    if (decoded.length > MAX_DECODED) reject(label + ' exceeds the decoded size limit');
    return decoded;
  } catch (error) {
    if (error instanceof ImportFailure) throw error;
    reject(label + ' has invalid or oversized compression');
  }
}

function unquote(value) {
  const escaped = value.replace(/%(?![0-9a-f]{2})/gi, '%25');
  try { return decodeURIComponent(escaped); }
  catch { reject('compressed draw.io page contains invalid percent encoding'); }
}

function decodePage(payload) {
  const compact = payload.replace(/\s+/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) reject('compressed draw.io page is not valid base64');
  const packed = Buffer.from(compact, 'base64');
  const inflated = boundedInflate(packed, true, 'decoded draw.io page');
  const decoded = utf8(inflated, 'compressed draw.io page');
  return unquote(decoded);
}

function crc32(buffers) {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function utf8(data, label) {
  const text = data.toString('utf8');
  if (Buffer.from(text, 'utf8').compare(data) !== 0) reject(label + ' is not valid UTF-8');
  return text;
}

function pngEmbeddedXml(data) {
  let cursor = PNG_MAGIC.length;
  while (cursor + 12 <= data.length) {
    const size = data.readUInt32BE(cursor);
    const kind = data.toString('ascii', cursor + 4, cursor + 8);
    const end = cursor + 8 + size;
    if (end + 4 > data.length) reject('PNG has a truncated metadata chunk');
    const payload = data.subarray(cursor + 8, end);
    if (crc32([data.subarray(cursor + 4, cursor + 8), payload]) !== data.readUInt32BE(end)) reject('PNG metadata chunk has an invalid CRC');
    cursor = end + 4;
    if (!['tEXt', 'zTXt', 'iTXt'].includes(kind)) {
      if (kind === 'IEND') break;
      continue;
    }
    const zero = payload.indexOf(0);
    if (zero < 0 || payload.subarray(0, zero).toString('latin1').toLowerCase() !== 'mxfile') continue;
    const rest = payload.subarray(zero + 1);
    let value;
    if (kind === 'tEXt') value = rest.toString('latin1');
    else if (kind === 'zTXt') {
      if (rest.length < 1 || rest[0] !== 0) reject('PNG mxfile text uses an unsupported compression method');
      value = utf8(boundedInflate(rest.subarray(1)), 'PNG mxfile text');
    } else {
      if (rest.length < 4 || rest[1] !== 0 || ![0, 1].includes(rest[0])) reject('PNG mxfile international text is malformed');
      const languageEnd = rest.indexOf(0, 2);
      const translatedEnd = languageEnd < 0 ? -1 : rest.indexOf(0, languageEnd + 1);
      if (translatedEnd < 0) reject('PNG mxfile international text is malformed');
      const payloadText = rest.subarray(translatedEnd + 1);
      value = utf8(rest[0] === 1 ? boundedInflate(payloadText) : payloadText, 'PNG mxfile metadata');
    }
    value = unquote(value);
    if (Buffer.byteLength(value, 'utf8') > MAX_DECODED) reject('embedded draw.io payload exceeds the decoded size limit');
    return value;
  }
  reject('PNG has no embedded mxfile diagram');
}

function svgEmbeddedXml(text) {
  const root = parseXml(text);
  const pending = [root];
  while (pending.length) {
    const element = pending.pop();
    for (const [name, value] of Object.entries(element.attrs)) {
      if (local(name).toLowerCase() !== 'content') continue;
      if (value.includes('<mxfile') || value.includes('<mxGraphModel')) {
        if (Buffer.byteLength(value, 'utf8') > MAX_DECODED) reject('embedded draw.io payload exceeds the decoded size limit');
        return value;
      }
    }
    pending.push(...element.children);
  }
  reject('SVG has no embedded draw.io diagram');
}

function sourcePages(file) {
  const data = readBounded(file, MAX_INPUT, '16 MiB');
  let text;
  if (data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) text = pngEmbeddedXml(data);
  else {
    text = utf8(data, 'input').replace(/^\uFEFF/, '').trim();
    if (/^<svg\b/i.test(text)) text = svgEmbeddedXml(text);
    else if (!text.startsWith('<')) reject('unsupported form; provide draw.io XML, compressed XML, or an SVG/PNG with embedded mxfile data');
  }
  const root = parseXml(text);
  if (local(root.name) === 'mxGraphModel') return { data, root, pages: [root], title: '' };
  if (local(root.name) !== 'mxfile') reject('unsupported XML root; expected mxfile or mxGraphModel');
  const pages = [];
  const pageTitles = [];
  for (const diagram of root.children.filter((child) => local(child.name) === 'diagram')) {
    let model = diagram.children.find((child) => local(child.name) === 'mxGraphModel');
    if (!model) {
      const payload = diagram.text.trim();
      if (!payload) reject('draw.io page has no readable mxGraphModel');
      const expanded = decodePage(payload);
      model = parseXml(expanded);
      if (local(model.name) !== 'mxGraphModel') reject('compressed page does not contain mxGraphModel');
    }
    pages.push(model);
    pageTitles.push(diagram.attrs.name || '');
  }
  if (!pages.length) reject('draw.io file contains no pages');
  return { data, root, pages, pageTitles };
}

function shapeName(style) {
  const shape = style.match(/(?:^|;)shape=([^;]+)/i)?.[1]?.toLowerCase() || 'rect';
  return SHAPE_ALIASES.find(([token]) => shape.includes(token))?.[1] || 'rectangle';
}

function plainLabel(value) { return cleanLabel(value, { html: true, breaks: true }); }

function extract(file, pageIndex) {
  const parsed = sourcePages(file);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= parsed.pages.length) reject('page index is out of range (file contains ' + parsed.pages.length + ' page(s))');
  const model = parsed.pages[pageIndex];
  const root = model.children.find((child) => local(child.name) === 'root');
  if (!root) reject('mxGraphModel has no root cell list');
  const records = [];
  for (const wrapper of root.children) {
    const cell = local(wrapper.name) === 'mxCell' ? wrapper : wrapper.children.find((item) => local(item.name) === 'mxCell');
    if (!cell) continue;
    const attrs = { ...wrapper.attrs, ...cell.attrs };
    if (!Object.hasOwn(attrs, 'value')) attrs.value = wrapper.attrs.label || '';
    records.push(attrs);
  }
  if (records.length > MAX_NODES + MAX_EDGES) reject('diagram exceeds the 7,000 cell limit');
  const used = new Set();
  const idMap = new Map();
  for (const attrs of records) {
    const id = attrs.id || '';
    if (idMap.has(id)) reject('diagram contains duplicate element ids');
    idMap.set(id, safeId(id, used, 'diagram'));
  }
  const vertices = records.filter((attrs) => attrs.vertex === '1');
  const edges = records.filter((attrs) => attrs.edge === '1');
  if (vertices.length > MAX_NODES || edges.length > MAX_EDGES) reject('diagram exceeds the node or relationship limit');
  const vertexIds = new Set(vertices.map((attrs) => attrs.id));
  const children = new Map();
  for (const attrs of vertices) {
    if (vertexIds.has(attrs.parent)) {
      if (!children.has(attrs.parent)) children.set(attrs.parent, []);
      children.get(attrs.parent).push(attrs.id);
    }
  }
  const discarded = { styles: 0, links: 0, urls: 0, assets: 0, unsupportedElements: 0, danglingRelationships: 0 };
  const nodes = [];
  const groups = [];
  const parents = new Map();
  for (const attrs of vertices) {
    const label = plainLabel(attrs.value || '');
    discarded.urls += label.urls;
    const style = attrs.style || '';
    if (style) discarded.styles += 1;
    if (attrs.link || attrs.href) discarded.links += 1;
    const shape = shapeName(style);
    if (/image=/i.test(style) || shape === 'image') discarded.assets += 1;
    const childIds = children.get(attrs.id) || [];
    const group = childIds.length > 0 || ['container', 'group'].includes(shape);
    const node = { id: idMap.get(attrs.id), label: label.text, kind: group ? 'container' : 'component', shape: group ? 'container' : shape };
    if (vertexIds.has(attrs.parent)) node.parentId = idMap.get(attrs.parent);
    nodes.push(node);
    parents.set(attrs.id, attrs.parent || '');
    if (childIds.length) groups.push({ id: idMap.get(attrs.id), label: label.text || 'Group', nodeIds: childIds.map((id) => idMap.get(id)) });
  }
  const relationships = [];
  for (const attrs of edges) {
    if (!vertexIds.has(attrs.source) || !vertexIds.has(attrs.target)) {
      discarded.danglingRelationships += 1;
      continue;
    }
    const label = plainLabel(attrs.value || '');
    discarded.urls += label.urls;
    const style = attrs.style || '';
    if (style) discarded.styles += 1;
    if (attrs.link || attrs.href) discarded.links += 1;
    const startArrow = /(?:^|;)startArrow=(?!none(?:;|$))/i.test(style);
    const endArrow = /(?:^|;)endArrow=(?!none(?:;|$))/i.test(style);
    const direction = startArrow && endArrow ? 'both' : startArrow ? 'reverse' : endArrow ? 'forward' : 'none';
    relationships.push({ from: idMap.get(attrs.source), to: idMap.get(attrs.target), label: label.text, kind: direction === 'none' ? 'association' : 'flow', direction });
  }
  for (const attrs of vertices) {
    let parent = parents.get(attrs.id);
    let depth = 0;
    const seen = new Set([attrs.id]);
    while (parents.has(parent)) {
      if (seen.has(parent)) reject('container hierarchy contains a cycle');
      seen.add(parent);
      depth += 1;
      if (depth > MAX_DEPTH) reject('container hierarchy exceeds the depth limit');
      parent = parents.get(parent);
    }
  }
  const title = plainLabel(parsed.pageTitles?.[pageIndex] || path.parse(file).name);
  return {
    schemaVersion: 1, sourceFormat: 'drawio', sourceDigest: sha256(parsed.data),
    title: title.text || 'Imported diagram',
    suggestedType: edges.length || nodes.some((node) => node.shape === 'diamond') ? 'flowchart' : 'architecture',
    nodes, relationships, groups, discarded,
    warnings: ['Source styles and coordinates are omitted; label text is inert data.'],
  };
}

try {
  const file = process.argv[2];
  if (!file) reject('Usage: node drawio-extract.mjs <file.drawio|SVG|PNG> [--page INDEX]');
  const args = process.argv.slice(3);
  const at = args.indexOf('--page');
  const index = at >= 0 ? Number(args[at + 1]) : 0;
  if (at >= 0 && !/^-?\d+$/.test(args[at + 1] || '')) reject('--page requires an integer index');
  writeJson(extract(file, index));
} catch (error) {
  process.stderr.write('drawio-extract: ' + (error?.message || String(error)) + '\n');
  process.exitCode = 2;
}
