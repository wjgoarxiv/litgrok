import { readFileSync } from 'node:fs';
import { RENDERED_RULES, RULES } from './rule-data.mjs';

export { RENDERED_RULES };
const signals = [
  ['SLOP-058', /href\s*=\s*["'](?:#|javascript:[^"']*)["']/gi, 'working destination'],
  ['SLOP-057', /<img\b[^>]*\bsrc\s*=\s*["'](?:#|)["']/gi, 'valid image source'],
  ['CF-503', /scale\(\s*0(?:[\s,)]|\.0)/gi, RULES['CF-503'].minScale],
  ['SLOP-060', /\blorem ipsum\b|\bplaceholder\b|\bcoming soon\b/gi, 'final copy'],
  ['SLOP-061', /<marquee\b/gi, 'static content'],
  ['CF-507', /will-change\s*:\s*(?:all|width|height|top|left)/gi, RULES['CF-507'].allowed],
  ['SLOP-009', /(?:-webkit-)?background-clip\s*:\s*text[^}]*gradient\(|gradient\([^}]*background-clip\s*:\s*text/gi, 'solid text color'],
  ['SLOP-012', /background-image\s*:[^;}]*(?:repeating-linear-gradient|repeating-radial-gradient)/gi, 'no decorative grid'],
  ['SLOP-026', /transition\s*:[^;}]*(?:width|height|top|left)/gi, 'compositor property'],
];
export function staticProbe(paths) {
  const findings = [];
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    for (const [rule, pattern, threshold] of signals) for (const match of source.matchAll(pattern)) {
      if (findings.filter((item) => item.rule === rule).length >= 30) break;
      const line = source.slice(0, match.index).split('\n').length;
      findings.push({ rule, severity: RULES[rule]?.severity || (rule === 'SLOP-058' ? 'MEDIUM' : 'LOW'), tier: 'derived', viewport: 'static', selector: `${path}:${line}`, value: match[0].slice(0, 100), threshold });
    }
  }
  return { findings, not_verified: RENDERED_RULES.map((rule) => ({ rule, reason: 'static fallback: needs a rendered DOM' })) };
}
