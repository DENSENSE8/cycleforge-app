import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA selected lines use semantic feedback and the canonical icon control geometry', () => {
  const source = readFileSync('src/components/fba/sidebar/FbaSelectedLineRow.tsx', 'utf8');

  assert.match(source, /text-text-success/);
  assert.match(source, /size="lg"/);
  assert.match(source, /radius="flush"/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:emerald|purple|violet|blue|red|amber)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
});
