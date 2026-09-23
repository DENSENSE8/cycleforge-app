import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA active shipment card uses semantic status and action roles', () => {
  const source = readFileSync('src/components/fba/sidebar/active-shipments/ActiveShipmentCard.tsx', 'utf8');

  assert.match(source, /size="xs"/);
  assert.match(source, /radius="flush"/);
  assert.match(source, /border-border-success bg-surface-success/);
  assert.match(source, /tone="gray"/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:emerald|purple)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
});
