import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stockSetRequest } from './stock-bin-verb-writes';

test('manual stock counts use the exact set contract and require no scan proof', () => {
  const request = stockSetRequest(
    { rowId: 'C0101101:SKU-1', barcode: 'C0101101', sku: 'SKU-1', qty: 2, face: 'C-01-01-1-01 · SKU-1' },
    7,
    { staffId: 12, reason: 'MANUAL_COUNT' },
  );
  const body = JSON.parse(String(request.init.body)) as Record<string, unknown>;

  assert.equal(request.url, '/api/locations/C0101101');
  assert.equal(request.init.method, 'PATCH');
  assert.equal(body.action, 'set');
  assert.equal(body.sku, 'SKU-1');
  assert.equal(body.qty, 7);
  assert.equal(body.reason, 'MANUAL_COUNT');
  assert.equal(body.staffId, 12);
  assert.equal('locationVerificationToken' in body, false);
  assert.ok(String(body.clientEventId).length > 0);
});

test('manual stock counts clamp negative input to zero', () => {
  const request = stockSetRequest(
    { rowId: 'A:SKU', barcode: 'A', sku: 'SKU', qty: 3, face: 'A · SKU' },
    -5,
  );
  const body = JSON.parse(String(request.init.body)) as { qty: number };
  assert.equal(body.qty, 0);
});
