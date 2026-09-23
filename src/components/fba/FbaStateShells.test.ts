import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA error feedback uses semantic danger roles without a theme-colored escape hatch', () => {
  const source = readFileSync('src/components/fba/FbaStateShells.tsx', 'utf8');

  assert.match(source, /border-border-danger/);
  assert.match(source, /text-text-danger/);
  assert.match(source, /hover:bg-surface-hover/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:red|emerald|purple|violet|blue|amber)-\d{2,3}\b/);
  assert.doesNotMatch(source, /stationThemeColors/);
});
