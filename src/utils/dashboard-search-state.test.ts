import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractOrdersFromDashboardCacheEntry,
  findDashboardSelectedOrderInCache,
  getDashboardOrderViewFromSearch,
  patchDashboardSelectedOrderFromAssignment,
  resolveDashboardSelectedOrderCandidate,
  normalizeDashboardDetailsContext,
  normalizeDashboardOrderViewParams,
  parseDashboardOpenOrderId,
} from '@/utils/dashboard-search-state';

test('getDashboardOrderViewFromSearch always resolves to the in-warehouse desk', () => {
  // Lifecycle tabs retired — presence flags / ustatus refine do not change the desk view.
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('shipped=')), 'unshipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('packed=')), 'unshipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('unshipped=')), 'unshipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('tested=')), 'unshipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('pending=')), 'unshipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('fba=')), 'unshipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('search=abc')), 'unshipped');
});

test('getDashboardOrderViewFromSearch ignores ustatus=PICKED as a tab (facet only)', () => {
  assert.equal(
    getDashboardOrderViewFromSearch(new URLSearchParams('unshipped=&ustatus=PICKED')),
    'unshipped',
  );
  assert.equal(
    getDashboardOrderViewFromSearch(new URLSearchParams('ustatus=PICKED')),
    'unshipped',
  );
});

test('normalizeDashboardOrderViewParams collapses every legacy tab onto unshipped', () => {
  const params = new URLSearchParams('pending=&search=abc&unshipped=&layout=board&ustatus=PENDING');
  const next = normalizeDashboardOrderViewParams(params, 'shipped');

  assert.equal(next, 'unshipped');
  assert.equal(params.has('pending'), false);
  assert.equal(params.has('packed'), false);
  assert.equal(params.has('fba'), false);
  assert.equal(params.has('shipped'), false);
  assert.equal(params.has('tested'), false);
  assert.equal(params.has('unshipped'), true);
  assert.equal(params.has('layout'), false);
  // Lane refine is left alone — only lifecycle presence flags are collapsed.
  assert.equal(params.get('ustatus'), 'PENDING');
  assert.equal(params.get('search'), 'abc');
});

test('normalizeDashboardOrderViewParams for picked maps to ?stage=picked on the desk', () => {
  const params = new URLSearchParams('unshipped=&ustatus=PENDING&stage=pending');
  const next = normalizeDashboardOrderViewParams(params, 'picked');
  assert.equal(next, 'unshipped');
  assert.equal(params.has('tested'), false);
  assert.equal(params.has('unshipped'), true);
  // Existing stage wins; when absent, picked → stage=picked (see other case below).
  assert.equal(params.get('stage'), 'pending');
  assert.equal(params.get('ustatus'), 'PENDING');
});

test('normalizeDashboardOrderViewParams sets stage=picked when picked has no stage', () => {
  const params = new URLSearchParams('ustatus=PENDING');
  const next = normalizeDashboardOrderViewParams(params, 'picked');
  assert.equal(next, 'unshipped');
  assert.equal(params.get('stage'), 'picked');
  assert.equal(params.has('unshipped'), true);
});

test('normalizeDashboardOrderViewParams preserves BLOCKED on Pending', () => {
  const params = new URLSearchParams('unshipped=&ustatus=BLOCKED&attention=1');
  const next = normalizeDashboardOrderViewParams(params, 'unshipped');
  assert.equal(next, 'unshipped');
  assert.equal(params.get('ustatus'), 'BLOCKED');
  assert.equal(params.get('attention'), '1');
});

test('parseDashboardOpenOrderId accepts only positive numeric ids', () => {
  assert.equal(parseDashboardOpenOrderId('123'), 123);
  assert.equal(parseDashboardOpenOrderId(' 42 '), 42);
  assert.equal(parseDashboardOpenOrderId('0'), null);
  assert.equal(parseDashboardOpenOrderId('-1'), null);
  assert.equal(parseDashboardOpenOrderId('abc'), null);
  assert.equal(parseDashboardOpenOrderId(null), null);
});

test('normalizeDashboardDetailsContext defaults from packed_at when missing', () => {
  assert.equal(normalizeDashboardDetailsContext({ packed_at: '2026-03-26 10:00:00' }), 'shipped');
  assert.equal(normalizeDashboardDetailsContext({ packed_at: null }), 'queue');
  assert.equal(normalizeDashboardDetailsContext({ packed_at: null }, 'shipped'), 'shipped');
});

test('extractOrdersFromDashboardCacheEntry handles supported cache shapes', () => {
  const order = { id: 7, packed_at: null } as any;

  assert.deepEqual(extractOrdersFromDashboardCacheEntry([order]), [order]);
  assert.deepEqual(extractOrdersFromDashboardCacheEntry({ orders: [order] }), [order]);
  assert.deepEqual(extractOrdersFromDashboardCacheEntry({ results: [order] }), [order]);
  assert.deepEqual(extractOrdersFromDashboardCacheEntry({ shipped: [order] }), [order]);
  assert.deepEqual(extractOrdersFromDashboardCacheEntry({ foo: [order] }), []);
  assert.deepEqual(extractOrdersFromDashboardCacheEntry(null), []);
});

test('findDashboardSelectedOrderInCache returns the first matching cached order with derived context', () => {
  const queuedOrder = { id: 11, packed_at: null } as any;
  const shippedOrder = { id: 12, packed_at: '2026-03-26 10:00:00' } as any;

  assert.deepEqual(
    findDashboardSelectedOrderInCache(
      [
        ['pending', { orders: [queuedOrder] }],
        ['shipped', { shipped: [shippedOrder] }],
      ],
      12
    ),
    { order: shippedOrder, context: 'shipped' }
  );
});

test('resolveDashboardSelectedOrderCandidate prefers cache over stored snapshot', () => {
  const cachedOrder = { id: 21, packed_at: null } as any;
  const storedOrder = { id: 21, packed_at: '2026-03-26 10:00:00' } as any;

  assert.deepEqual(
    resolveDashboardSelectedOrderCandidate({
      openOrderId: 21,
      cachedEntries: [['pending', { orders: [cachedOrder] }]],
      storedSelection: {
        order: storedOrder,
        context: 'shipped',
        savedAt: Date.now(),
      },
    }),
    { order: cachedOrder, context: 'queue' }
  );
});

test('resolveDashboardSelectedOrderCandidate falls back to stored snapshot when cache misses', () => {
  const storedOrder = { id: 31, packed_at: null } as any;

  assert.deepEqual(
    resolveDashboardSelectedOrderCandidate({
      openOrderId: 31,
      cachedEntries: [],
      storedSelection: {
        order: storedOrder,
        context: 'queue',
        savedAt: Date.now(),
      },
    }),
    { order: storedOrder, context: 'queue' }
  );
});

test('patchDashboardSelectedOrderFromAssignment updates only matching selected orders', () => {
  const current = {
    id: 77,
    packed_at: null,
    picker_id: 1,
    packer_id: null,
    ship_by_date: null,
    notes: 'old',
    condition: 'USED',
    shipping_tracking_number: 'AAA',
    item_number: 'OLD',
  } as any;

  const next = patchDashboardSelectedOrderFromAssignment(current, {
    orderIds: [77],
    pickerId: 2,
    packerId: 4,
    shipByDate: '2026-03-30',
    notes: 'new',
    condition: 'NEW',
    shippingTrackingNumber: 'BBB',
    itemNumber: 'NEW-ITEM',
  });

  assert.equal(next?.picker_id, 2);
  assert.equal(next?.packer_id, 4);
  assert.equal(next?.ship_by_date, '2026-03-30');
  assert.equal(next?.notes, 'new');
  assert.equal(next?.condition, 'NEW');
  assert.equal(next?.shipping_tracking_number, 'BBB');
  assert.equal(next?.item_number, 'NEW-ITEM');
  assert.equal(patchDashboardSelectedOrderFromAssignment(current, { orderIds: [88], pickerId: 9 }), current);
});


/** Regression (2026-08-20): */
test('the To-ship desk keeps the params that open the Add-orders rail', () => {
  const spec = routeParamsFor('/shipping/orders');
  assert.ok(spec, 'expected a route spec for /shipping/orders');

  for (const key of ['ingest', 'new']) {
    const kept = parseRouteParams(spec, new URLSearchParams(`${key}=true`));
    assert.equal(
      kept.get(key),
      'true',
      `${key}=true must survive the boundary parse or the rail closes itself`,
    );
  }
});

/** Regression (2026-09-01): */
test('the To-ship desk keeps the param that opens the Labels walk', () => {
  const spec = routeParamsFor('/shipping/orders');
  assert.ok(spec, 'expected a route spec for /shipping/orders');

  const kept = parseRouteParams(spec, new URLSearchParams('paperwork=13306'));
  assert.equal(
    kept.get('paperwork'),
    '13306',
    'paperwork=<id> must survive the boundary parse or the walk closes itself',
  );
  assert.equal(
    parseRouteParams(spec, new URLSearchParams('paperwork=0')).get('paperwork'),
    null,
  );
});
