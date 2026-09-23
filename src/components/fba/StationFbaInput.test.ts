import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA station input delegates visual state to semantic and station-skin roles', () => {
  const source = readFileSync('src/components/fba/StationFbaInput.tsx', 'utf8');
  assert.doesNotMatch(
    source,
    /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:red|emerald|blue|violet)-\d{2,3}\b/,
  );
  assert.match(source, /text-text-info/);
  assert.match(source, /text-text-success/);
  assert.match(source, /bg-surface-danger/);
});
