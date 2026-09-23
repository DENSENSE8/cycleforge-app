import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('mobile FBA unit task records through the canonical scan endpoint without a camera fork', () => {
  const source = readFileSync('src/components/mobile/shipping/MobileFbaUnitScanTask.tsx', 'utf8');
  assert.match(source, /\/api\/fba\/items\/scan/);
  assert.match(source, /station: 'MOBILE_FBA'/);
  assert.match(source, /appearance="flush"/);
  assert.match(source, /radius="flush"/);
  assert.match(source, /permanent shell control for camera capture/);
  assert.doesNotMatch(source, /<motion\.|whileTap|stiffness|damping/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:red|emerald|purple|violet|blue|amber|indigo)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
});
