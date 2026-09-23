import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FBA shipment rail scopes history through the existing active-shipment controller', () => {
  const source = readFileSync('src/components/fba/sidebar/FbaActiveShipments.tsx', 'utf8');

  assert.match(source, /FbaShipmentRailScope = 'all' \| 'active' \| 'shipped'/);
  assert.match(source, /scope === 'shipped' \? \[\] : shipments/);
  assert.match(source, /scope === 'active' \? \[\] : recentShipped/);
  assert.match(source, /<EmptyState/);
  assert.match(source, /scope === 'shipped' \? 'Shipped FBA plans' : 'Recent shipments'/);
});
