#!/usr/bin/env node
import path from 'node:path';
import { cleanLabel, ImportFailure, readBounded, reject, safeId, sha256, writeJson } from './import-common.mjs';

const MAX_ELEMENTS = 10_000;
const MAX_NODES = 2_000;
const MAX_RELATIONSHIPS = 5_000;
const MAX_DEPTH = 64;
const NODE_SHAPES = { rectangle: 'rectangle', ellipse: 'ellipse', diamond: 'diamond', image: 'image', embeddable: 'embed', iframe: 'embed' };
const EDGE_TYPES = new Set(['arrow', 'line']);
const CONTAINER_TYPES = new Set(['frame', 'magicframe']);

function checkJsonDepth(text) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') {
      depth += 1;
      if (depth > MAX_DEPTH) reject('scene nesting exceeds the depth limit (64)');
    } else if (char === ']' || char === '}') depth -= 1;
  }
}

function finiteGeometry(element) {
  for (const key of ['x', 'y', 'width', 'height']) {
    const value = element[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) reject('element geometry field ' + key + ' must be numeric');
    if (Math.abs(value) > 10_000_000) reject('element geometry field ' + key + ' is outside the supported range');
  }
}

function inertLabel(raw) {
  const filtered = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  return cleanLabel(filtered);
}

function extract(file) {
  const filename = path.basename(file);
  if (!/\.excalidraw(?:\.json)?$/i.test(filename)) reject('unsupported form; provide a saved .excalidraw scene');
  const data = readBounded(file, 16 * 1024 * 1024, '16 MiB');
  const text = data.toString('utf8');
  if (Buffer.from(text, 'utf8').compare(data) !== 0) reject('scene is not valid UTF-8 JSON');
  checkJsonDepth(text);
  let document;
  try {
    document = JSON.parse(text, (key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) reject('non-finite JSON number is unsupported');
      return value;
    });
  } catch (error) {
    if (error instanceof ImportFailure) throw error;
    reject('scene is malformed JSON');
  }
  if (!document || typeof document !== 'object' || Array.isArray(document) || document.type !== 'excalidraw') reject('input is not an Excalidraw scene');
  const elements = document.elements;
  if (!Array.isArray(elements)) reject('scene has no elements array');
  if (elements.length > MAX_ELEMENTS) reject('element limit exceeded (max 10,000)');

  const idMap = new Map();
  const used = new Set();
  const live = [];
  const discarded = { styles: 0, links: 0, urls: 0, scripts: 0, assets: 0, unsupportedElements: 0, deletedElements: 0, freehandStrokes: 0, danglingRelationships: 0 };
  for (const item of elements) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) reject('scene element must be an object');
    if (typeof item.id !== 'string' || typeof item.type !== 'string') reject('scene elements require string id and type fields');
    if (idMap.has(item.id)) reject('scene contains duplicate element ids');
    idMap.set(item.id, safeId(item.id, used, 'scene'));
    finiteGeometry(item);
    if (item.isDeleted === true) discarded.deletedElements += 1;
    else live.push(item);
  }
  const frameIds = new Set(live.filter((item) => CONTAINER_TYPES.has(item.type)).map((item) => item.id));
  const labels = new Map();
  for (const item of live) {
    if (item.type !== 'text') continue;
    if (item.text !== undefined && typeof item.text !== 'string') reject('text element content must be a string');
    const result = inertLabel(item.text || '');
    discarded.urls += result.urls;
    if (typeof item.containerId === 'string' && idMap.has(item.containerId) && result.text) {
      if (!labels.has(item.containerId)) labels.set(item.containerId, []);
      labels.get(item.containerId).push(result.text);
    }
  }

  const nodes = [];
  const nodeSourceIds = new Set();
  for (const item of live) {
    const sourceId = item.id;
    if (EDGE_TYPES.has(item.type) || (item.type === 'text' && typeof item.containerId === 'string') || item.type === 'selection' || item.type === 'laser') continue;
    if (item.type === 'freedraw') {
      discarded.freehandStrokes += 1;
      continue;
    }
    let shape;
    let kind;
    let label = '';
    if (CONTAINER_TYPES.has(item.type)) {
      shape = 'container';
      kind = 'container';
      label = typeof item.name === 'string' ? item.name : '';
    } else if (item.type === 'text') {
      shape = 'text';
      kind = 'annotation';
      label = item.text || '';
    } else if (Object.hasOwn(NODE_SHAPES, item.type)) {
      shape = NODE_SHAPES[item.type];
      kind = 'component';
      if (['image', 'embeddable', 'iframe'].includes(item.type)) discarded.assets += 1;
    } else {
      discarded.unsupportedElements += 1;
      continue;
    }
    const clean = inertLabel(label);
    label = clean.text;
    discarded.urls += clean.urls;
    const bound = labels.get(sourceId) || [];
    if (bound.length) label = bound.join('\n').slice(0, 2_000);
    if (typeof item.link === 'string' && item.link) {
      discarded.links += 1;
      if (/\b(?:https?|ftp|file|javascript|data):/i.test(item.link)) discarded.urls += 1;
    }
    if (nodes.length >= MAX_NODES) reject('node limit exceeded (max 2,000)');
    const node = { id: idMap.get(sourceId), label, kind, shape };
    if (typeof item.frameId === 'string' && frameIds.has(item.frameId)) node.parentId = idMap.get(item.frameId);
    nodes.push(node);
    nodeSourceIds.add(sourceId);
  }

  const relationships = [];
  for (const item of live) {
    if (!EDGE_TYPES.has(item.type)) continue;
    const start = item.startBinding?.elementId;
    const end = item.endBinding?.elementId;
    if (typeof start !== 'string' || typeof end !== 'string' || !nodeSourceIds.has(start) || !nodeSourceIds.has(end)) {
      discarded.danglingRelationships += 1;
      continue;
    }
    const label = inertLabel((labels.get(item.id) || []).join('\n'));
    discarded.urls += label.urls;
    const hasStart = typeof item.startArrowhead === 'string' && !['', 'none'].includes(item.startArrowhead);
    const hasEnd = typeof item.endArrowhead === 'string' && !['', 'none'].includes(item.endArrowhead);
    const direction = hasStart && hasEnd ? 'both' : hasStart ? 'reverse' : hasEnd || item.type === 'arrow' ? 'forward' : 'none';
    relationships.push({ from: idMap.get(start), to: idMap.get(end), label: label.text, kind: item.type === 'arrow' ? 'flow' : 'association', direction });
  }
  if (relationships.length > MAX_RELATIONSHIPS) reject('relationship limit exceeded (max 5,000)');

  const groups = [];
  for (const frameId of [...frameIds].sort()) {
    const members = live.filter((item) => item.frameId === frameId && nodeSourceIds.has(item.id)).map((item) => idMap.get(item.id));
    if (!members.length) continue;
    const frame = nodes.find((node) => node.id === idMap.get(frameId));
    groups.push({ id: idMap.get(frameId), label: frame?.label || 'Frame', nodeIds: members });
  }
  const sourceGroups = new Map();
  for (const item of live) {
    if (!nodeSourceIds.has(item.id) || !Array.isArray(item.groupIds)) continue;
    for (const groupId of item.groupIds.slice(0, 64)) {
      if (typeof groupId !== 'string') continue;
      if (!sourceGroups.has(groupId) && sourceGroups.size >= MAX_NODES) reject('group limit exceeded (max 2,000)');
      if (!sourceGroups.has(groupId)) sourceGroups.set(groupId, []);
      sourceGroups.get(groupId).push(item.id);
    }
  }
  for (const [groupId, members] of sourceGroups) {
    const groupSafeId = 'g-' + sha256(Buffer.from(groupId)).slice(0, 16);
    if (used.has(groupSafeId)) reject('group id collides with an element id');
    used.add(groupSafeId);
    groups.push({ id: groupSafeId, label: 'Group', nodeIds: members.map((id) => idMap.get(id)) });
  }
  if (!nodes.length) reject('scene contains no supported diagram elements');
  discarded.styles = live.filter((item) => ['backgroundColor', 'strokeColor', 'strokeStyle', 'roughness'].some((key) => Object.hasOwn(item, key))).length;
  if (document.files && typeof document.files === 'object' && !Array.isArray(document.files)) discarded.assets += Object.keys(document.files).length;
  return {
    schemaVersion: 1, sourceFormat: 'excalidraw', sourceDigest: sha256(data),
    title: filename.replace(/\.excalidraw(?:\.json)?$/i, '') || 'Imported diagram',
    suggestedType: relationships.length ? 'flowchart' : 'architecture',
    nodes, relationships, groups, discarded,
    warnings: ['Source coordinates and styling are omitted; label text is inert data.'],
  };
}

try {
  const file = process.argv[2];
  if (!file) reject('Usage: node excalidraw-extract.mjs <file.excalidraw>');
  writeJson(extract(file));
} catch (error) {
  process.stderr.write('excalidraw-extract: ' + (error?.message || String(error)) + '\n');
  process.exitCode = 2;
}
