import test from 'node:test';
import assert from 'node:assert/strict';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import {
  SUPPORT_WARRANTY_FORWARDED_PARAMS,
  buildSupportWarrantyRedirectSearch,
  extractOrdersFromDashboardCacheEntry,
  findDashboardSelectedOrderInCache,
  getDashboardOrderViewFromSearch,
  patchDashboardSelectedOrderFromAssignment,
  resolveDashboardSelectedOrderCandidate,
  normalizeDashboardDetailsContext,
  normalizeDashboardOrderViewParams,
  parseDashboardOpenOrderId,
} from '@/utils/dashboard-search-state';

test('getDashboardOrderViewFromSearch prefers explicit view params', () => {
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('shipped=')), 'shipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('packed=')), 'packed');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('unshipped=')), 'unshipped');
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('tested=')), 'tested');
  // Legacy ?pending resolves to the merged 'unshipped' mode (Pending).
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('pending=')), 'unshipped');
  // Vestigial ?fba deleted (IA row L) — falls through to Pending.
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('fba=')), 'unshipped');
});

test('getDashboardOrderViewFromSearch rewrites legacy ustatus=TESTED to tested tab', () => {
  assert.equal(
    getDashboardOrderViewFromSearch(new URLSearchParams('unshipped=&ustatus=TESTED')),
    'tested',
  );
  assert.equal(
    getDashboardOrderViewFromSearch(new URLSearchParams('ustatus=TESTED')),
    'tested',
  );
});

test('buildSupportWarrantyRedirectSearch preserves claim open + filters', () => {
  const qs = buildSupportWarrantyRedirectSearch(
    new URLSearchParams('warranty=&open=42&wstatus=SUBMITTED&wexp=1&search=ORD-1'),
  );
  const params = new URLSearchParams(qs);
  assert.equal(params.get('mode'), 'warranty');
  assert.equal(params.get('open'), '42');
  assert.equal(params.get('wstatus'), 'SUBMITTED');
  assert.equal(params.get('wexp'), '1');
  assert.equal(params.get('search'), 'ORD-1');
});

test('getDashboardOrderViewFromSearch falls back to unshipped', () => {
  assert.equal(getDashboardOrderViewFromSearch(new URLSearchParams('search=abc')), 'unshipped');
});

test('normalizeDashboardOrderViewParams clears competing view params', () => {
  const params = new URLSearchParams('pending=&search=abc&unshipped=&layout=board&ustatus=PENDING');
  const next = normalizeDashboardOrderViewParams(params, 'shipped');

  assert.equal(next, 'shipped');
  assert.equal(params.has('pending'), false);
  assert.equal(params.has('unshipped'), false);
  assert.equal(params.has('packed'), false);
  assert.equal(params.has('fba'), false);
  assert.equal(params.has('shipped'), true);
  assert.equal(params.has('layout'), false);
  assert.equal(params.has('ustatus'), false);
  assert.equal(params.get('search'), 'abc');
});

test('normalizeDashboardOrderViewParams for tested sets ?tested and clears lane params', () => {
  const params = new URLSearchParams('unshipped=&ustatus=PENDING&stage=pending');
  const next = normalizeDashboardOrderViewParams(params, 'tested');
  assert.equal(next, 'tested');
  assert.equal(params.has('tested'), true);
  assert.equal(params.has('unshipped'), false);
  assert.equal(params.has('ustatus'), false);
  assert.equal(params.has('stage'), false);
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
    tester_id: 1,
    packer_id: null,
    ship_by_date: null,
    notes: 'old',
    condition: 'USED',
    shipping_tracking_number: 'AAA',
    item_number: 'OLD',
  } as any;

  const next = patchDashboardSelectedOrderFromAssignment(current, {
    orderIds: [77],
    testerId: 2,
    packerId: 4,
    shipByDate: '2026-03-30',
    notes: 'new',
    condition: 'NEW',
    shippingTrackingNumber: 'BBB',
    itemNumber: 'NEW-ITEM',
  });

  assert.equal(next?.tester_id, 2);
  assert.equal(next?.packer_id, 4);
  assert.equal(next?.ship_by_date, '2026-03-30');
  assert.equal(next?.notes, 'new');
  assert.equal(next?.condition, 'NEW');
  assert.equal(next?.shipping_tracking_number, 'BBB');
  assert.equal(next?.item_number, 'NEW-ITEM');
  assert.equal(patchDashboardSelectedOrderFromAssignment(current, { orderIds: [88], testerId: 9 }), current);
});

test('every param the retired-front-door redirects forward is declared by /dashboard', () => {
  // `/dashboard` reads these off the URL solely to forward them — to Support for
  // `?warranty=`, and to the FBA board for `?fba`. An undeclared hand-off key is
  // dropped the instant this route mounts `useSurfaceParamHygiene()` (step 6 of
  // the migration method, still open per nav-routing-refactor-FINISH-PROMPT §3.3),
  // which would silently strip the bookmark's open claim, filters, or intent.
  //
  // `wstatus`/`wexp` were undeclared before 2026-07-30 — a latent break waiting
  // for whoever graduated the dashboard. `fba` became one when IA row L removed it
  // from the lifecycle-tab set while the redirect kept reading it.
  const spec = routeParamsFor('/dashboard')!;
  const undeclared = [...SUPPORT_WARRANTY_FORWARDED_PARAMS, 'fba', 'warranty'].filter(
    (key) => !parseRouteParams(spec, new URLSearchParams(`${key}=1`)).has(key),
  );
  assert.deepEqual(
    undeclared,
    [],
    'These keys ride a /dashboard redirect but are not declared by DASHBOARD_ROUTE_PARAMS, ' +
      'so the boundary parse will drop them the moment the surface mounts the hygiene hook. ' +
      'Declare them in src/lib/routing/query-mode-routes.ts.',
  );
});

/**
 * Regression (2026-08-20): the Add-orders rail opened and closed itself.
 *
 * `useSurfaceParamHygiene` (mounted in `src/app/shipping/layout.tsx`) re-parses
 * the URL against the route spec on every param change and drops anything the
 * route does not declare. `ingest` was undeclared, so the chrome Add wrote
 * `?ingest=true` and the very next hygiene pass stripped it — `showIngestRail`
 * flipped false before the operator could type. Both keys that open the rail
 * must survive the boundary parse.
 */
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
