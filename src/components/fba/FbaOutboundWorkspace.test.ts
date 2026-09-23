import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA workbench restores its plan, combine, and shipped bodies from governed sources', () => {
  const source = readFileSync('src/components/fba/FbaOutboundWorkspace.tsx', 'utf8');

  assert.match(source, /FbaPlanRailBody/);
  assert.match(source, /FbaCombineRailBody/);
  assert.match(source, /FbaActiveShipments/);
  assert.match(source, /activeMode === 'plan'/);
  assert.match(source, /activeMode === 'combine'/);
  assert.match(source, /activeMode === 'shipped'/);
  assert.doesNotMatch(source, /StationFbaInput/);
});
