import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('mobile FBA plan uses the canonical today plan read/write endpoints', () => {
  const source = readFileSync('src/components/mobile/shipping/MobileFbaPlanTask.tsx', 'utf8');

  assert.match(source, /\/api\/fba\/shipments\/today/);
  assert.match(source, /\/api\/fba\/shipments\/today\/items/);
  assert.match(source, /appearance="flush"/);
  assert.match(source, /radius="flush"/);
  assert.match(source, /shell&apos;s scan control remains the only camera door/);
  assert.doesNotMatch(source, /<motion\.|whileTap|stiffness|damping/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:red|emerald|purple|violet|blue|amber|indigo)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
});
