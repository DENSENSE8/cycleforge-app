import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  patchUnshippedOrderCache,
  patchUnshippedOrderPicked,
  removeUnshippedOrderFromCache,
  invalidateUnshippedCounts,
  insertUnshippedOrderIntoCache,
} from './dashboard-cache-patch';

const listKey = (extra: Record<string, unknown>) => ['dashboard-table', 'unshipped', extra];

test('patch merges into the matching row across ALL unshipped list variants', () => {
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [{ id: 1, has_pick_scan: false }, { id: 2, has_pick_scan: false }]);
  qc.setQueryData(listKey({ stage: 'pending', limit: 200 }), [{ id: 1, has_pick_scan: false }]);

  patchUnshippedOrderCache(qc, 1, { has_pick_scan: true, picked_by: 7 });

  const a = qc.getQueryData(listKey({ stage: null })) as Array<Record<string, unknown>>;
  const b = qc.getQueryData(listKey({ stage: 'pending', limit: 200 })) as Array<Record<string, unknown>>;
  assert.equal(a[0].has_pick_scan, true, 'variant A row 1 patched');
  assert.equal(a[0].picked_by, 7);
  assert.equal(b[0].has_pick_scan, true, 'variant B row 1 patched');
  assert.equal(a[1].has_pick_scan, false, 'untouched row unchanged');
});

test('patch is a no-op (reference-stable) when the row is not present', () => {
  const qc = new QueryClient();
  const rows = [{ id: 1 }, { id: 2 }];
  qc.setQueryData(listKey({ stage: null }), rows);
  patchUnshippedOrderCache(qc, 999, { has_pick_scan: true });
  assert.equal(qc.getQueryData(listKey({ stage: null })), rows, 'same array reference (no re-render)');
});

test('remove drops the row from every variant', () => {
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [{ id: 1 }, { id: 2 }, { id: 3 }]);
  removeUnshippedOrderFromCache(qc, 2);
  const rows = qc.getQueryData(listKey({ stage: null })) as Array<{ id: number }>;
  assert.deepEqual(rows.map((r) => r.id), [1, 3]);
});

test('list-prefix helpers never touch the separate counts key', () => {
  const qc = new QueryClient();
  const counts = { total: 5, byStage: { all: 5, pending: 5, picked: 0 }, combos: [] };
  qc.setQueryData(['dashboard-table', 'unshipped-counts', { staffId: null }], counts);
  qc.setQueryData(listKey({ stage: null }), [{ id: 1 }]);

  patchUnshippedOrderCache(qc, 1, { has_pick_scan: true });
  removeUnshippedOrderFromCache(qc, 1);

  assert.equal(
    qc.getQueryData(['dashboard-table', 'unshipped-counts', { staffId: null }]),
    counts,
    'counts cache untouched by list-prefix mutations',
  );
});

test('non-array cache entries pass through untouched', () => {
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), undefined);
  patchUnshippedOrderCache(qc, 1, { x: 1 });
  removeUnshippedOrderFromCache(qc, 1);
  assert.equal(qc.getQueryData(listKey({ stage: null })), undefined);
});

test('invalidateUnshippedCounts marks the counts query stale', async () => {
  const qc = new QueryClient();
  qc.setQueryData(['dashboard-table', 'unshipped-counts', { staffId: null }], { total: 1 });
  invalidateUnshippedCounts(qc);
  const state = qc.getQueryState(['dashboard-table', 'unshipped-counts', { staffId: null }]);
  assert.equal(state?.isInvalidated, true);
});

test('patch is reference-stable when the row is present but unchanged', () => {
  // Two subscribers now run the same `order.picked` patch (the desk hook and UnshippedTable's own, for the /tech embed that has no desk hook…
  const qc = new QueryClient();
  const rows = [{ id: 1, has_pick_scan: true, picked_by: 7 }];
  qc.setQueryData(listKey({ stage: null }), rows);

  patchUnshippedOrderCache(qc, 1, { has_pick_scan: true, picked_by: 7 });

  assert.equal(
    qc.getQueryData(listKey({ stage: null })),
    rows,
    'same array reference when nothing actually moved',
  );
});

test('order.picked patch flips has_pick_scan + picker across every variant + refreshes counts', () => {
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [{ id: 42, has_pick_scan: false, tested_by: 3 }]);
  qc.setQueryData(listKey({ stage: 'pending' }), [{ id: 42, has_pick_scan: false }]);
  qc.setQueryData(['dashboard-table', 'unshipped-counts', { staffId: null }], { total: 1 });

  const applied = patchUnshippedOrderPicked(qc, {
    orderId: 42,
    pickedBy: 9,
    pickedByName: 'Pat',
    pickedAt: '2026-09-27T17:00:00.000Z',
  });

  assert.equal(applied, true);
  const all = qc.getQueryData(listKey({ stage: null })) as Array<Record<string, unknown>>;
  const pending = qc.getQueryData(listKey({ stage: 'pending' })) as Array<Record<string, unknown>>;
  assert.equal(all[0].has_pick_scan, true, 'lane signal flipped — PENDING becomes PICKED');
  assert.equal(all[0].picked_by, 9);
  assert.equal(all[0].picked_by_name, 'Pat');
  assert.equal(all[0].picked_at, '2026-09-27T17:00:00.000Z');
  assert.equal(all[0].tested_by, 3, 'a pick is not a QC verdict — tested_* untouched');
  assert.equal(pending[0].has_pick_scan, true, 'every cached variant, not just the active tab');
  assert.equal(
    qc.getQueryState(['dashboard-table', 'unshipped-counts', { staffId: null }])?.isInvalidated,
    true,
    'legend tallies follow the row',
  );
});

test('order.picked patch never clobbers an existing picker with a null', () => {
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [
    { id: 42, has_pick_scan: false, picked_by: 3, picked_by_name: 'Sam' },
  ]);

  patchUnshippedOrderPicked(qc, { orderId: 42, pickedBy: null, pickedByName: null });

  const rows = qc.getQueryData(listKey({ stage: null })) as Array<Record<string, unknown>>;
  assert.equal(rows[0].has_pick_scan, true);
  assert.equal(rows[0].picked_by, 3, 'a payload with no picker leaves the recorded one alone');
  assert.equal(rows[0].picked_by_name, 'Sam');
});

test('order.picked with picked:false moves the row back to pending and clears the picker', () => {
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [
    { id: 42, has_pick_scan: true, picked_by: 3, picked_by_name: 'Sam', picked_at: '2026-09-28T08:00:00.000Z', tested_by: 5 },
  ]);
  qc.setQueryData(['dashboard-table', 'unshipped-counts', { staffId: null }], { total: 1 });

  const applied = patchUnshippedOrderPicked(qc, { orderId: 42, picked: false, pickedBy: null, pickedAt: null });

  assert.equal(applied, true);
  const rows = qc.getQueryData(listKey({ stage: null })) as Array<Record<string, unknown>>;
  assert.equal(rows[0].has_pick_scan, false, 'un-pick — PICKED becomes PENDING');
  assert.equal(rows[0].picked_by, null);
  assert.equal(rows[0].picked_by_name, null);
  assert.equal(rows[0].picked_at, null);
  assert.equal(rows[0].tested_by, 5, 'QC is a unit fact — an un-pick leaves it');
  assert.equal(
    qc.getQueryState(['dashboard-table', 'unshipped-counts', { staffId: null }])?.isInvalidated,
    true,
  );
});

test('order.picked patch ignores a payload with no usable order id', () => {
  const qc = new QueryClient();
  const rows = [{ id: 42, has_pick_scan: false }];
  qc.setQueryData(listKey({ stage: null }), rows);

  assert.equal(patchUnshippedOrderPicked(qc, { orderId: undefined }), false);
  assert.equal(patchUnshippedOrderPicked(qc, { orderId: 'not-a-number' }), false);
  assert.equal(qc.getQueryData(listKey({ stage: null })), rows, 'cache untouched');
});

test('insertUnshippedOrderIntoCache prepends a new row and promotes an existing one', () => {
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [{ id: 1, order_id: 'OLD' }]);
  qc.setQueryData(listKey({ stage: 'pending', limit: 200 }), [{ id: 1, order_id: 'OLD' }]);

  const created = {
    id: 99,
    order_id: 'CFLOOP-1',
    shipping_tracking_number: 'CFLOOPTRACK01',
    tracking_number: 'CFLOOPTRACK01',
    has_pick_scan: false,
  };
  insertUnshippedOrderIntoCache(qc, created);
  qc.setQueryData(listKey({ stage: null }), [{ id: 1, order_id: 'OLD' }, created]);
  insertUnshippedOrderIntoCache(qc, created);

  const a = qc.getQueryData(listKey({ stage: null })) as Array<{ id: number }>;
  const b = qc.getQueryData(listKey({ stage: 'pending', limit: 200 })) as Array<{ id: number }>;
  assert.deepEqual(a.map((r) => r.id), [99, 1]);
  assert.deepEqual(b.map((r) => r.id), [99, 1]);
});

test('order.picked patch carries the pack bench the event published', () => {
  // `publishOrderPicked` sends packLocationId/Name; dropping them left the
  // Station chip on an em dash until an unrelated refetch.
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [
    { id: 42, has_pick_scan: false, pack_location_id: null, pack_location_name: null },
  ]);

  patchUnshippedOrderPicked(qc, {
    orderId: 42,
    pickedBy: 9,
    packLocationId: 2,
    packLocationName: 'Station 2',
  });

  const rows = qc.getQueryData(listKey({ stage: null })) as Array<Record<string, unknown>>;
  assert.equal(rows[0].pack_location_id, 2);
  assert.equal(rows[0].pack_location_name, 'Station 2');
});

test('order.picked patch leaves the bench alone when the scan placed nothing', () => {
  // An unarmed bench publishes nulls. Writing them would blank a placement the
  // pack floor made a moment earlier through a different door.
  const qc = new QueryClient();
  qc.setQueryData(listKey({ stage: null }), [
    { id: 42, has_pick_scan: false, pack_location_id: 5, pack_location_name: 'Station 5' },
  ]);

  patchUnshippedOrderPicked(qc, {
    orderId: 42,
    pickedBy: 9,
    packLocationId: null,
    packLocationName: null,
  });

  const rows = qc.getQueryData(listKey({ stage: null })) as Array<Record<string, unknown>>;
  assert.equal(rows[0].has_pick_scan, true);
  assert.equal(rows[0].pack_location_name, 'Station 5');
});
