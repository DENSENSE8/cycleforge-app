import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA plan quantity controls use flush geometry and semantic danger feedback', () => {
  const source = readFileSync('src/components/fba/station-input/FbaQtyStepper.tsx', 'utf8');

  assert.match(source, /radius="flush"/);
  assert.match(source, /border-border-danger text-text-danger hover:bg-surface-danger/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:red|emerald|purple|violet|blue|amber)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:[tblr]-)?(?:sm|md|lg|xl|2xl|3xl)\b/);
});
