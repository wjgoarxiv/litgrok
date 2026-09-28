#!/usr/bin/env node
import path from 'node:path';
import { cleanLabel, readBounded, reject, safeId, sha256, writeJson } from './import-common.mjs';

const MAX_NODES = 2_000;
const MAX_EDGES = 5_000;
const MAX_DEPTH = 64;
const HEADER = /^(flowchart|graph|sequenceDiagram|stateDiagram-v2|erDiagram)\b(.*)$/i;
const KINDS = { flowchart: 'flowchart', graph: 'flowchart', sequencediagram: 'sequence', 'statediagram-v2': 'state', erdiagram: 'er' };

function label(raw) {
  const clean = cleanLabel(String(raw), { html: true, breaks: true });
  return { text: clean.text.replace(/\*\*(.*?)\*\*|__(.*?)__/g, (_, a, b) => a || b), urls: clean.urls };
}

function readBlocks(file, data) {
  const source = data.toString('utf8');
  if (Buffer.from(source, 'utf8').compare(data) !== 0) reject('input is not valid UTF-8');
  if (/\.(?:mmd|mermaid)$/i.test(file)) return [{ source, firstLine: 1 }];
  if (!/\.(?:md|markdown|mdown|mkd)$/i.test(file)) reject('provide .mmd, .mermaid, or Markdown');
  const blocks = [];
  const tick = String.fromCharCode(96);
  let active = false;
  let fence = '';
  let lines = [];
  let firstLine = 0;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const number = index + 1;
    if (!active) {
      const found = line.match(new RegExp('^\\s*(' + tick + '{3,}|~{3,})\\s*mermaid\\s*$', 'i'));
      if (found) {
        active = true;
        fence = found[1];
        lines = [];
        firstLine = number + 1;
      }
    } else if (new RegExp('^\\s*' + (fence[0] === tick ? tick : '~') + '{' + fence.length + ',}\\s*$').test(line)) {
      blocks.push({ source: lines.join('\n'), firstLine });
      active = false;
      fence = '';
    } else lines.push(line);
  }
  if (active) reject('unterminated Mermaid fence at line ' + (firstLine - 1));
  if (!blocks.length) reject('Markdown contains no fenced Mermaid block');
  return blocks;
}

function extract(file, diagramIndex) {
  const data = readBounded(file, 4 * 1024 * 1024, '4 MiB');
  const blocks = readBlocks(file, data);
  if (!Number.isInteger(diagramIndex) || diagramIndex < 0 || diagramIndex >= blocks.length) reject('diagram index out of range (' + blocks.length + ' block(s))');
  let sourceLines = blocks[diagramIndex].source.split(/\r?\n/);
  let firstLine = blocks[diagramIndex].firstLine;
  if (sourceLines[0]?.trim() === '---') {
    const end = sourceLines.slice(1).findIndex((line) => line.trim() === '---');
    if (end < 0) reject('unterminated Mermaid frontmatter');
    sourceLines = sourceLines.slice(end + 2);
    firstLine += end + 1;
  }
  const lines = sourceLines.map((text, index) => ({ number: firstLine + index, text: text.trim() }))
    .filter((item) => item.text && !item.text.startsWith('%%'));
  const headerIndex = lines.findIndex((item) => HEADER.test(item.text));
  if (headerIndex < 0) reject('unsupported or missing Mermaid diagram declaration');
  const headerLine = lines[headerIndex];
  const header = headerLine.text.match(HEADER);
  if (!header) reject('malformed diagram declaration at line ' + headerLine.number);
  const rawKind = header[1].toLowerCase();
  const grammar = KINDS[rawKind];
  if (!grammar) reject('unsupported Mermaid grammar at line ' + headerLine.number);
  let directionHint = header[2].match(/\b(TD|TB|BT|LR|RL)\b/i)?.[1].toUpperCase() || '';
  const nodes = new Map();
  const groupLabels = new Map();
  const relationships = [];
  const stack = [];
  const fields = new Map();
  let entity = null;
  let title = '';
  const discarded = { styles: 0, links: 0, urls: 0, scripts: 0, directives: 0, unsupportedElements: 0 };

  function add(id, visible = '', shape = 'rectangle', kind = 'component') {
    if (!nodes.has(id)) {
      if (nodes.size >= MAX_NODES) reject('node limit exceeded (max 2,000)');
      nodes.set(id, { label: visible || id, shape, kind, parent: stack.at(-1) || null });
    } else if (visible && nodes.get(id).label === id) nodes.set(id, { ...nodes.get(id), label: visible, shape });
  }
  function connect(from, to, caption, kind, direction) {
    if (relationships.length >= MAX_EDGES) reject('relationship limit exceeded (max 5,000)');
    relationships.push({ from, to, label: caption, kind, direction });
  }
  function acceptLabel(raw) {
    const value = label(raw);
    discarded.urls += value.urls;
    return value.text;
  }

  for (const item of lines.slice(headerIndex + 1)) {
    const text = item.text;
    if (text.startsWith('%%{')) { discarded.directives += 1; continue; }
    if (/^(click|href|link)\b/i.test(text)) { discarded.links += 1; continue; }
    if (/^(style|classDef|class|linkStyle)\b/i.test(text)) { discarded.styles += 1; continue; }
    if (text.startsWith('title ')) { title = acceptLabel(text.slice(6)); continue; }
    if (/^direction\s+/i.test(text)) {
      directionHint = text.split(/\s+/, 2)[1].toUpperCase();
      if (!['TD', 'TB', 'BT', 'LR', 'RL'].includes(directionHint)) reject('invalid direction at line ' + item.number);
      continue;
    }
    if (grammar === 'flowchart') {
      if (text.toLowerCase() === 'end') {
        if (!stack.length) reject('unexpected subgraph end at line ' + item.number);
        stack.pop();
        continue;
      }
      const sub = text.match(/^subgraph\s+([\w.-]+)(?:\s*\[([^\]]*)\])?$/i);
      if (sub) {
        const id = sub[1];
        const name = acceptLabel(sub[2] || id);
        groupLabels.set(id, name);
        add(id, name, 'container', 'container');
        stack.push(id);
        if (stack.length > MAX_DEPTH) reject('subgraph depth exceeds 64');
        continue;
      }
      const edge = text.match(/^([\w.-]+)(?:\[([^\]]*)\]|\{([^}]*)\}|\(([^)]*)\))?\s*(<-->|<--|-->|---|-.->|==>|->|--o|--x)\s*(?:\|([^|]*)\|\s*)?([\w.-]+)(?:\[([^\]]*)\]|\{([^}]*)\}|\(([^)]*)\))?$/);
      if (edge) {
        const [, from, leftRect, leftDiamond, leftEllipse, arrow, captionRaw, to, rightRect, rightDiamond, rightEllipse] = edge;
        add(from, acceptLabel(leftRect || leftDiamond || leftEllipse || from), leftDiamond ? 'diamond' : leftEllipse ? 'ellipse' : 'rectangle');
        add(to, acceptLabel(rightRect || rightDiamond || rightEllipse || to), rightDiamond ? 'diamond' : rightEllipse ? 'ellipse' : 'rectangle');
        const caption = acceptLabel(captionRaw || '');
        connect(from, to, caption, 'flow', arrow === '<-->' ? 'both' : arrow === '<--' ? 'reverse' : arrow === '---' ? 'none' : 'forward');
        continue;
      }
      const node = text.match(/^([\w.-]+)(?:\[([^\]]*)\]|\{([^}]*)\}|\(([^)]*)\))?$/);
      if (node) {
        const [, id, rect, diamond, ellipse] = node;
        add(id, acceptLabel(rect || diamond || ellipse || id), diamond ? 'diamond' : ellipse ? 'ellipse' : 'rectangle');
        continue;
      }
      reject('unsupported flowchart syntax at line ' + item.number);
    }
    if (grammar === 'sequence') {
      const participant = text.match(/^(?:participant|actor)\s+(?:"([^"]+)"\s+as\s+)?([\w.-]+)(?:\s+as\s+(?:"([^"]+)"|([\w.-]+)))?$/i);
      if (participant) {
        const [, quoted, id, aliasQuoted, alias] = participant;
        add(id, acceptLabel(aliasQuoted || alias || quoted || id), 'rectangle', 'participant');
        continue;
      }
      const message = text.match(/^([\w.-]+)\s*(<<->>|<-->|->>|-->>|->|-->|-x|--x)(?:[+-])?\s*([\w.-]+)(?:\s*:\s*(.*))?$/);
      if (message) {
        const [, from, arrow, to, raw] = message;
        add(from, '', 'rectangle', 'participant');
        add(to, '', 'rectangle', 'participant');
        connect(from, to, acceptLabel(raw || ''), 'message', arrow.includes('<<') || arrow === '<-->' ? 'both' : 'forward');
        continue;
      }
      reject('unsupported sequence syntax at line ' + item.number);
    }
    if (grammar === 'state') {
      const alias = text.match(/^state\s+"([^"]+)"\s+as\s+([\w.-]+)$/i);
      if (alias) { add(alias[2], acceptLabel(alias[1]), 'ellipse', 'state'); continue; }
      const transition = text.match(/^(\[\s*\*\s*\]|[\w.-]+)\s*(-->|-[.])\s*(\[\s*\*\s*\]|[\w.-]+)(?:\s*:\s*(.*))?$/);
      if (transition) {
        let [, from, arrow, to, raw] = transition;
        from = from.includes('*') ? 'initial' : from;
        to = to.includes('*') ? 'final' : to;
        add(from, from === 'initial' ? 'Initial' : from, 'ellipse', 'state');
        add(to, to === 'final' ? 'Final' : to, 'ellipse', 'state');
        connect(from, to, acceptLabel(raw || ''), 'transition', 'forward');
        continue;
      }
      if (/^[\w.-]+$/.test(text)) { add(text, text, 'ellipse', 'state'); continue; }
      reject('unsupported state syntax at line ' + item.number);
    }
    if (grammar === 'er') {
      if (text === '}') { entity = null; continue; }
      const declaration = text.match(/^([\w.-]+)\s*\{$/);
      if (declaration) {
        entity = declaration[1];
        if (!fields.has(entity)) fields.set(entity, []);
        add(entity, entity, 'rectangle', 'entity');
        continue;
      }
      const relation = text.match(/^([\w.-]+)\s+([|}o{.]+--[|}o{.]+)\s+([\w.-]+)(?:\s*:\s*(.*))?$/);
      if (relation) {
        const [, from, cardinality, to, raw] = relation;
        add(from, '', 'rectangle', 'entity');
        add(to, '', 'rectangle', 'entity');
        const caption = acceptLabel(raw || '');
        connect(from, to, caption ? cardinality + ': ' + caption : cardinality, 'association', 'forward');
        continue;
      }
      if (entity) {
        const field = text.match(/^[\w.-]+\s+([\w.-]+)(?:\s+\w+)?$/);
        if (field) { fields.get(entity).push(field[1]); continue; }
      }
      reject('unsupported ER syntax at line ' + item.number);
    }
  }
  if (stack.length) reject('flowchart has an unterminated subgraph');
  if (entity) reject('ER diagram has an unterminated entity');
  if (!nodes.size) reject('diagram contains no supported nodes');
  const used = new Set();
  const idMap = new Map([...nodes.keys()].map((id) => [id, safeId(id, used, 'diagram')]));
  const outputNodes = [];
  for (const [id, value] of nodes) {
    const nodeLabel = fields.has(id) && fields.get(id).length ? value.label + '\n' + fields.get(id).slice(0, 100).join('\n') : value.label;
    const node = { id: idMap.get(id), label: nodeLabel.slice(0, 2_000), kind: value.kind, shape: value.shape };
    if (value.parent && idMap.has(value.parent)) node.parentId = idMap.get(value.parent);
    outputNodes.push(node);
  }
  const outputGroups = [...groupLabels].filter(([id]) => [...nodes.values()].some((value) => value.parent === id))
    .map(([id, name]) => ({ id: idMap.get(id), label: name, nodeIds: [...nodes].filter(([, value]) => value.parent === id).map(([nodeId]) => idMap.get(nodeId)) }));
  return {
    schemaVersion: 1, sourceFormat: 'mermaid', sourceDigest: sha256(data), title: title || path.parse(file).name || 'Imported diagram',
    suggestedType: grammar === 'flowchart' && groupLabels.size ? 'architecture' : grammar,
    nodes: outputNodes, relationships: relationships.map((edge) => ({ ...edge, from: idMap.get(edge.from), to: idMap.get(edge.to) })),
    groups: outputGroups, discarded,
    warnings: ['Source layout and styling are omitted; labels are inert data.', ...(directionHint ? ['Declared direction: ' + directionHint + '.'] : [])],
  };
}

try {
  const file = process.argv[2];
  if (!file) reject('Usage: node mermaid-extract.mjs <file.mmd|Markdown> [--diagram INDEX]');
  const args = process.argv.slice(3);
  const at = args.indexOf('--diagram');
  const index = at >= 0 ? Number(args[at + 1]) : 0;
  if (at >= 0 && !/^-?\d+$/.test(args[at + 1] || '')) reject('--diagram requires an integer index');
  writeJson(extract(file, index));
} catch (error) {
  process.stderr.write('mermaid-extract: ' + (error?.message || String(error)) + '\n');
  process.exitCode = 2;
}
