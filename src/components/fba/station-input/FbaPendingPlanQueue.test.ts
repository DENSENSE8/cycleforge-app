import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA plan confirmation delegates its action face to the canonical Button', () => {
  const source = readFileSync('src/components/fba/station-input/FbaPendingPlanQueue.tsx', 'utf8');

  assert.match(source, /variant="primary"/);
  assert.match(source, /radius="flush"/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:purple|violet|blue|emerald|rose|red|amber|yellow|green|sky|cyan)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
});
