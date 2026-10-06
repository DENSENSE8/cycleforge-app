/**
 * The Picker rail's optimistic row must carry the identity the server echo
 * gives the same scan, or the echo replaces it with a different row and the
 * scan drops off the Recent rail.
 *
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/hooks/station/handleTrackingScan.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { handleTrackingScan } from './handleTrackingScan';
import type { ScanHandlerContext } from './types';

const bus = new EventTarget();
// The handler dispatches on `window`; Node has none, so the test's bus stands in.
Object.defineProperty(globalThis, 'window', { value: bus, configurable: true });

function context(): ScanHandlerContext {
  return {
    userId: '7',
    userName: 'Tester',
    getScanContextOrder: () => null,
    reopenScanContextOrder: () => null,
    syncActiveOrderState: () => {},
    setIsLoading: () => {},
    setErrorMessage: () => {},
    setSuccessMessage: () => {},
    setInputValue: () => {},
    inputRef: { current: null },
    scanSessionIdRef: { current: null },
    queryClient: new QueryClient(),
    triggerGlobalRefresh: () => {},
    resolveManual: () => {},
    clearManuals: () => {},
    newIdempotencyKey: () => 'key',
  };
}

async function scan(reply: Record<string, unknown>): Promise<Record<string, unknown>> {
  globalThis.fetch = (async () => new Response(JSON.stringify(reply), { status: 200 })) as typeof fetch;
  let detail: Record<string, unknown> | null = null;
  const listener = (event: Event) => {
    detail = (event as CustomEvent<Record<string, unknown>>).detail;
  };
  bus.addEventListener('tech-log-added', listener);
  await handleTrackingScan('1Z999AA10123456784', context());
  bus.removeEventListener('tech-log-added', listener);
  assert.ok(detail, 'the scan inserted no row');
  return detail;
}

const order = (id: number | null) => ({
  id,
  orderId: id ? `ORD-${id}` : '—',
  productTitle: id ? 'Bose QC45' : 'Unknown Product',
  itemNumber: null,
  sku: id ? 'BQC45' : '—',
  condition: id ? 'Used' : '—',
  notes: '',
  tracking: '1Z999AA10123456784',
  serialNumbers: [],
  testDateTime: '2026-10-05 11:30:00',
  testedBy: 7,
  accountSource: null,
  quantity: 1,
  status: null,
  statusHistory: [],
  isShipped: false,
  shipByDate: null,
  createdAt: null,
});

test('a matched pick is inserted as its station_activity_logs row and matched order', async () => {
  const row = await scan({
    success: true, found: true, orderFound: true, salId: 501, techActivityId: 501, techSerialId: null, order: order(77),
  });
  // `GET /api/picking/desk/logs` answers this scan as id = sal.id, order_db_id = the order.
  assert.equal(row.id, 501);
  assert.equal(row.source_row_id, 501);
  assert.equal(row.order_db_id, 77);
  assert.equal(row.product_title, 'Bose QC45');
});

test('an exception pick is inserted as its station_activity_logs row', async () => {
  const row = await scan({
    success: true, found: true, orderFound: false, salId: 502, techActivityId: 502, order: order(null),
  });
  assert.equal(row.id, 502);
  assert.equal(row.order_db_id, null);
});
