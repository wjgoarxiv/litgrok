import test from 'node:test';
import assert from 'node:assert/strict';
import { visualQuality } from '../.grok/skills/lit-diagram-drawer/scripts/visual-quality.mjs';

test('diagram verifier finds cluster, accent, case and label-measure defects', () => {
  const svg='<svg viewBox="0 0 500 300"><rect data-group-id="a" x="0" y="0" width="100" height="250"/><rect data-group-id="b" x="100" y="0" width="100" height="250"/><rect data-node-id="a1" x="15" y="40" width="70" height="45" fill="#d6336c"/><rect data-node-id="a2" x="15" y="130" width="70" height="45" fill="#2f9e44"/><rect data-node-id="b1" x="115" y="40" width="70" height="45" fill="#1971c2"/><rect data-node-id="b2" x="115" y="130" width="70" height="45" fill="#e8590c"/><text data-role="node" data-node-id="a1" x="20" y="70" font-size="16">The Flow Of Information</text></svg>';
  const issues=visualQuality(svg).issues.join('\n');
  for(const code of ['OF-201','OF-202','OF-203','OF-204'])assert.match(issues,new RegExp(code));
});
