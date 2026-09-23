import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA workspace sidebar has square loading and semantic error states', () => {
  const source = readFileSync('src/components/fba/sidebar/FbaWorkspaceSidebar.tsx', 'utf8');

  assert.match(source, /rounded-none bg-surface-sunken/);
  assert.match(source, /border-border-danger bg-surface-danger/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:red|emerald|purple|violet|blue|amber|indigo)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
});
