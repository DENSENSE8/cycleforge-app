import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { NAV_FACET_CONTEXTS } from '@/lib/nav/facets/contexts';
import { NAV_RECENT_SURFACE_IDS } from '@/lib/nav/recents/surfaces';
import { NAV_PAGE_DECLS, NAV_SIDEBAR_NAVIGATION_SURFACE } from '@/lib/nav/context/pages';
import type { NavDefinition } from '@/lib/nav/org-nav';

import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import {
  APP_SIDEBAR_NAV,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  spineSectionIdForPage,
} from '@/lib/sidebar-navigation';
import { DOMAIN_GROUPS, LANE_DOORS } from '@/lib/nav/lanes';
import { NAV_PARITY, pageStops, parityGaps, uncoveredRows } from './parity';
import { declaredRouteParams, type ResolveNavContextInput } from './build';
import { resolveNavContext } from './resolve';
import { NAV_CONTEXT_PINNED_LEGACY, NAV_CONTEXT_ROLLOUT } from './rollout';
import { NavContextSchema, NavItemSchema, navControlParams, type NavContext, type NavItem } from './schema';
import { isIncomingGridSortable, isReceivingGridSortable } from '@/lib/receiving/receiving-grid-layout';

const ALL = new Set<string>(ALL_PERMISSIONS);

type Options = Partial<Omit<ResolveNavContextInput, 'pathname' | 'params'>>;

function at(href: string, options: Options = {}): NavContext {
  const url = new URL(href, 'http://nav.test');
  return resolveNavContext({
    pathname: url.pathname,
    params: url.searchParams,
    permissions: ALL,
    orgNav: null,
    ...options,
  });
}

const items = (ctx: NavContext): NavItem[] => ctx.sections.flatMap((section) => section.items);
const itemIds = (ctx: NavContext): string[] => items(ctx).map((item) => item.id);
const activeIds = (ctx: NavContext): string[] => items(ctx).filter((item) => item.active).map((item) => item.id);

/** Pages a URL can land on (the two compatibility entries resolve elsewhere). */
const LIVE_PAGES = SIDEBAR_PAGE_NAV.filter((page) => at(page.href).page.id === page.id);

/** Every context a staffer with every permission can reach: each page, each view, each ‹ peek. */
function everyContext(): Array<{ href: string; ctx: NavContext }> {
  const out: Array<{ href: string; ctx: NavContext }> = [];
  for (const page of LIVE_PAGES) {
    for (const stop of pageStops(page.id)) {
      out.push({ href: stop.href, ctx: stop.context });
      out.push({ href: `${stop.href} (peek)`, ctx: at(stop.href, { view: 'top' }) });
    }
  }
  return out;
}

test('every SIDEBAR_PAGE_NAV page resolves to itself and survives the wire', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    const ctx = at(page.href);
    if (ctx.page.id !== page.id) {
      // Only the compatibility entries may land elsewhere — an L1 row that
      // does not land on its own page would light the wrong door.
      assert.ok(!APP_SIDEBAR_NAV.some((item) => item.id === page.id), `${page.id} lands on ${ctx.page.id}`);
      continue;
    }
    assert.deepEqual(NavContextSchema.parse(JSON.parse(JSON.stringify(ctx))), ctx, page.id);
  }
  assert.ok(LIVE_PAGES.length >= 20);
});

/** A door lane's pages (`<page>.<lane>.modes`), painted as the mode switcher on every page of that lane. */
const isLanePageSection = (section: NavContext['sections'][number]): boolean => /^[^.]+\.[^.]+\.modes$/.test(section.id);
/** A page's own modes (`<page>.modes`, `NAV_PAGE_DECLS[page].modes`) — the same card, destinations on the page itself. */
const isPageModeSection = (ctx: NavContext) => (section: NavContext['sections'][number]): boolean => section.id === `${ctx.page.id}.modes`;

test('every section item href round-trips: resolving it lights exactly that item', () => {
  for (const page of LIVE_PAGES) {
    const home = at(page.href);
    if (home.scope !== 'section') continue;
    for (const section of home.sections) {
      for (const item of section.items) {
        const ctx = at(item.href);
        if (isLanePageSection(section)) {
          assert.equal(ctx.page.id, item.id, `${item.href} lands on its own page`);
          continue;
        }
        assert.equal(ctx.page.id, page.id, `${item.href} leaves ${page.id}`);
        assert.equal(ctx.scope, 'section', item.href);
        // A page's own mode is current on its card beside the view it opens: set the modes aside, then exactly one view is lit.
        const modeIds = new Set(
          ctx.sections
            .filter((section) => isPageModeSection(ctx)(section) || isLanePageSection(section))
            .flatMap((modes) => modes.items.map((mode) => mode.id)),
        );
        const lit = activeIds(ctx).filter((id) => !modeIds.has(id));
        if (modeIds.has(item.id)) {
          assert.ok(activeIds(ctx).includes(item.id), `${item.href}: its mode is current`);
          assert.equal(lit.length, 1, `${item.href}: a mode opens exactly one view`);
        } else {
          assert.deepEqual(lit, [item.id], item.href);
        }
      }
    }
  }
});

test('every lane-map row lands on its own page, and the peek lights it', () => {
  const map = at('/unbox', { view: 'top' });
  assert.equal(map.scope, 'top');
  for (const item of items(map)) {
    assert.equal(at(item.href).page.id, item.id, item.href);
    assert.deepEqual(activeIds(at(item.href, { view: 'top' })), [item.id], item.href);
  }
});

test('a section lists its own views — and, on a door lane landing, the lane modes', () => {
  for (const { href, ctx } of everyContext()) {
    if (ctx.scope !== 'section') continue;
    for (const section of ctx.sections) {
      for (const item of section.items) {
        const landsOn = isLanePageSection(section) ? item.id : ctx.page.id;
        assert.equal(at(item.href).page.id, landsOn, `${href}: ${item.id} → ${item.href}`);
      }
    }
  }
});

test('Fulfillment is a lane door: one map row, the lane name on its panel, its pages as modes', () => {
  const map = at('/unbox', { view: 'top' });
  const outbound = map.sections.find((section) => section.id === 'fulfillment');
  assert.deepEqual(outbound?.items.map((item) => [item.id, item.label]), [['outbound', 'Fulfillment']]);
  assert.equal(outbound?.label, undefined);
  for (const id of ['fba', 'label-intake']) assert.ok(!itemIds(map).includes(id), id);
  // Lit from every page of the lane, not just the landing page.
  assert.deepEqual(activeIds(at('/shipping/fba', { view: 'top' })), ['outbound']);

  const landing = at('/shipping/orders');
  assert.equal(landing.page.label, 'Fulfillment');
  assert.equal(landing.back?.label, 'Fulfillment');
  const modes = landing.sections.find(isLanePageSection);
  assert.equal(landing.sections[0], modes, 'modes lead the panel');
  assert.deepEqual(modes?.items.map((item) => [item.id, item.label]), [
    ['outbound', 'FBM'],
    ['fulfilled', 'Fulfilled'],
    ['fba', 'FBA'],
  ]);
  // FBM is Amazon's acronym for every channel we ship ourselves — the mode says so; FBA is the split.
  assert.deepEqual(modes?.items.map((item) => item.description), [
    'Fulfilled by merchant · all channels',
    'Every package that left the building',
    'Fulfilled by Amazon',
  ]);
  assert.equal(modes?.items.find((item) => item.id === 'outbound')?.active, true);

  // Operator 2026-10-03: the Live feed opens Operations; owner 2026-10-04:
  // Support right under it, then Scan Stations above Receiving; fixed
  // utilities close the map.
  assert.equal(map.sections[1]?.id, 'live-feed');
  assert.equal(map.sections[2]?.id, 'support');
  const stations = map.sections[3];
  assert.equal(stations?.id, 'floor');
  assert.deepEqual(stations?.items.map((item) => [item.id, item.label, item.kind]), [
    ['receive', 'Scan Stations', 'drill'],
  ]);
  assert.ok(
    map.sections.findIndex((section) => section.id === 'floor') <
      map.sections.findIndex((section) => section.id === 'inbound'),
  );
  assert.equal(map.sections.at(-1)?.id, 'bottom');
});

test('Sales is a lane door with Front desk and Customers as first-class modes', () => {
  const map = at('/counter', { view: 'top' });
  const sales = map.sections.find((section) => section.id === 'sales');
  assert.deepEqual(sales?.items.map((item) => [item.id, item.label]), [['sales', 'Sales']]);

  for (const href of ['/counter', '/customers']) {
    const context = at(href);
    assert.equal(context.scope, 'section', href);
    assert.equal(context.page.label, 'Sales', href);
    assert.equal(context.back?.label, 'Sales', href);
    const modes = context.sections.find(isLanePageSection);
    assert.deepEqual(modes?.items.map((item) => [item.id, item.label]), [
      ['sales', 'Front desk'],
      ['customers', 'Customers'],
    ], href);
  }
  assert.equal(at('/customers').search.placeholder, 'Search customers…');
});

test('the parent map keeps Scan Stations to one door across every station route', () => {
  const stationPaths = ['/stations/live', '/triage', '/unbox', '/test', '/pick', '/pack', '/shipping/scan-out'];
  for (const href of stationPaths) {
    const map = at(href, { view: 'top' });
    const stationSection = map.sections.find((section) => section.id === 'floor');
    assert.equal(stationSection?.items.length, 1, href);
    assert.equal(stationSection?.items[0]?.label, 'Scan Stations', href);
    assert.equal(stationSection?.items[0]?.active, true, href);
    assert.equal(at(stationSection?.items[0]?.href ?? '/').page.id, map.page.id, href);
  }
});

test('every mode of a door lane wears the lane on ‹ and the SAME mode card, itself current — never a ‹ <Page> row', () => {
  // Derived from lane membership (`LANE_DOORS`), so a page added to a door
  // lane gets the parent tier with no declaration (operator 2026-09-28:
  // Labels & docs and Sourcing are modes, like Shipping, not back rows).
  for (const [laneId, doorId] of Object.entries(LANE_DOORS)) {
    const door = getSidebarPageNav(doorId!);
    assert.ok(door, laneId);
    const lanePages = SIDEBAR_PAGE_NAV.filter(
      (page) => spineSectionIdForPage(page) === laneId && APP_SIDEBAR_NAV.some((item) => item.id === page.id),
    );
    const doorModes = at(door.href).sections.find(isLanePageSection)?.items.map((item) => item.id);
    // One page is no choice (Support): no switcher, but ‹ still names the lane.
    if (lanePages.length < 2) {
      assert.equal(doorModes, undefined, `${laneId}: a one-page lane paints no mode switcher`);
      assert.equal(at(door.href).back?.label, DOMAIN_GROUPS.find((lane) => lane.id === laneId)?.label, `${laneId}: ‹ names the lane`);
      continue;
    }
    assert.deepEqual(doorModes?.[0], doorId, `${laneId}: the door leads its modes`);
    for (const page of lanePages) {
      const ctx = at(page.href);
      if (ctx.scope !== 'section') continue;
      const laneLabel = at(door.href).page.label;
      assert.equal(ctx.back?.label, laneLabel, `${page.id}: ‹ names the lane`);
      const modes = ctx.sections.find(isLanePageSection);
      assert.equal(ctx.sections[0], modes, `${page.id}: modes lead the panel`);
      assert.deepEqual(modes?.items.map((item) => item.id), doorModes, `${page.id}: same modes, same order`);
      assert.ok(modes?.items.some((item) => item.id === page.id), `${page.id} is one of its lane's modes`);
    }
  }
});

test('back is null exactly at top, and never navigates', () => {
  for (const { href, ctx } of everyContext()) {
    assert.equal(ctx.back === null, ctx.scope === 'top', href);
    if (ctx.back) assert.deepEqual(ctx.back, { label: ctx.page.label, mode: 'local' }, href);
  }
});

test('view digits are bound only on a declared page panel — never on the ‹ peek or an undeclared page', () => {
  for (const { href, ctx } of everyContext()) {
    const declared = NAV_PAGE_DECLS[ctx.page.id]?.viewKeys === true;
    assert.equal(ctx.viewKeys === true, declared && ctx.scope === 'section', href);
  }
  assert.equal(at('/shipping/orders').viewKeys, true);
  assert.equal(at('/shipping/orders', { view: 'top' }).viewKeys, undefined);
});

test('nav items carry no counts', () => {
  const allowed = new Set(['id', 'label', 'href', 'active', 'kind', 'badge', 'description']);
  for (const { href, ctx } of everyContext()) {
    for (const item of items(ctx)) {
      for (const key of Object.keys(item)) assert.ok(allowed.has(key), `${href}: ${item.id}.${key}`);
      assert.ok(item.badge === undefined || item.badge === 'beta', `${href}: ${item.id} badge ${item.badge}`);
      assert.doesNotMatch(item.label, /(^|[\s(·])\d+\)?$/, `${href}: "${item.label}" ends in a count`);
    }
  }
  const row = { id: 'x', label: 'X', href: '/x', active: false, kind: 'link' };
  assert.equal(NavItemSchema.safeParse({ ...row, count: 3 }).success, false);
  assert.equal(NavItemSchema.safeParse({ ...row, badge: '3' }).success, false);
});

test('permission filtering removes the rows a role cannot reach', () => {
  const noPacking = new Set([...ALL].filter((p) => p !== 'packing.view'));
  assert.deepEqual(itemIds(at('/shipping/orders', { permissions: noPacking })), [
    'outbound',
    'fba',
    'orders',
    'label-intake',
  ]);

  const noPackingReview = new Set([...ALL].filter((p) => p !== 'packing.review'));
  assert.ok(!itemIds(at('/shipping/orders', { permissions: noPackingReview })).includes('label-intake'));

  // Packing-only roles reach one Fulfillment door (Fulfilled): one page is no
  // choice, so no lane rows paint — only Fulfilled's saved views.
  const shippedOnly = new Set(['shipping.view', 'packing.view']);
  const archive = at('/fulfilled', { permissions: shippedOnly });
  assert.equal(archive.scope, 'section');
  assert.deepEqual(itemIds(archive), ['all', 'online', 'fba', 'sku', 'delivered']);

  // No child door at all: no Shipping section, and no Shipping row on the map.
  const noDoor = at('/shipping/orders', { permissions: new Set(['shipping.view', 'receiving.view']) });
  assert.equal(noDoor.scope, 'top');
  assert.ok(!itemIds(noDoor).includes('outbound'));

  const noReceiving = new Set([...ALL].filter((p) => p !== 'receiving.view'));
  const map = itemIds(at('/', { permissions: noReceiving, view: 'top' }));
  for (const id of ['triage', 'receive', 'pickup', 'repair', 'incoming']) assert.ok(!map.includes(id), id);
  assert.ok(map.includes('outbound'));

  const noImport = new Set([...ALL].filter((p) => p !== 'orders.import'));
  const verbs = (at('/shipping/orders', { permissions: noImport }).actions ?? []).map((a) => a.id);
  assert.ok(verbs.includes('orders.add'));
  assert.ok(!verbs.includes('orders.upload-csv'));

  // Facet groups follow the facets endpoint's gate, not just the page door.
  assert.equal(at('/pickup').filters?.facetContext, 'pickup');
  const noWalkIn = new Set([...ALL].filter((p) => p !== 'walk_in.view'));
  assert.equal(at('/pickup', { permissions: noWalkIn }).filters, undefined);
});

test('the org nav override shapes the section and the map — one pipeline with MasterNav', () => {
  const orgNav: NavDefinition = {
    entries: [
      {
        id: 'outbound',
        children: [
          { id: 'label-intake', order: 0 },
          { id: 'orders', label: 'Allocate queue' },
        ],
      },
      { id: 'fba', hidden: true },
      // Not a lane door (a door row wears its lane's name, like Outbound).
      { id: 'products', label: 'Catalog desk' },
    ],
  };
  const shipping = at('/shipping/orders', { orgNav });
  assert.deepEqual(itemIds(shipping), ['outbound', 'fulfilled', 'label-intake', 'orders']);
  assert.equal(items(shipping).find((i) => i.id === 'orders')?.label, 'Allocate queue');

  const map = at('/', { orgNav, view: 'top' });
  assert.ok(!itemIds(map).includes('fba'));
  assert.equal(items(map).find((i) => i.id === 'products')?.label, 'Catalog desk');
});

test('Fulfillment never says Pending; Picker keeps its Pending queue view', () => {
  for (const { href, ctx } of everyContext()) {
    const words = [
      ctx.page.label,
      ctx.back?.label,
      ctx.search.placeholder,
      ...ctx.sections.flatMap((section) => [section.label, ...section.items.map((item) => item.label)]),
      ...(ctx.actions ?? []).map((action) => action.label),
      ...(ctx.filters?.groups ?? []).map((group) => group.label),
    ];
    if (ctx.page.id === 'ready-to-pack' || ctx.page.id === 'testing') continue;
    for (const word of words) if (word) assert.doesNotMatch(word, /\bpending\b/i, `${href}: "${word}"`);
  }
});

test('every advertised param survives the hygiene of the view that reads it', () => {
  for (const page of LIVE_PAGES) {
    const stops = pageStops(page.id);
    const declared = new Set(declaredRouteParams(stops.map((stop) => new URL(stop.href, 'http://t').pathname)));
    for (const stop of stops) {
      for (const key of stop.context.params) assert.ok(declared.has(key), `${stop.href} advertises ${key}`);
      const pathname = new URL(stop.href, 'http://t').pathname;
      const own = declaredRouteParams([pathname]);
      for (const group of stop.context.filters?.groups ?? []) {
        assert.ok(own.includes(group.param), `${stop.href}: facet ${group.param} is stripped`);
      }
      if (stop.context.search.param) {
        assert.ok(own.includes(stop.context.search.param), `${stop.href}: search ${stop.context.search.param}`);
      }
      const locate = stop.context.search.locate;
      for (const key of locate ? [locate.param, locate.statusParam, ...(locate.facetParam ? [locate.facetParam] : [])] : []) {
        assert.ok(own.includes(key), `${stop.href}: locate ${key} is stripped`);
      }
      for (const key of navControlParams(stop.context.controls)) {
        assert.ok(own.includes(key), `${stop.href}: control ${key} is stripped`);
      }
    }
  }
});

test('the Shipping filters removed on 2026-09-26 are advertised and survive with real values', () => {
  const samples: ReadonlyArray<readonly [string, string, string]> = [
    ['/shipping/orders', 'stage', 'packed'],
    ['/shipping/orders', 'aging', 'overdue'],
    ['/shipping/orders', 'late', '1'],
    ['/shipping/orders', 'attention', '1'],
    ['/shipping/orders', 'ustatus', 'BLOCKED'],
    ['/shipping/orders', 'rowFlag', 'awaiting_customer'],
    ['/shipping/orders', 'cage', '1'],
    ['/shipping/orders', 'staff', '4'],
    ['/shipping/orders', 'pickedBy', '7'],
    ['/shipping/orders', 'packedBy', '7'],
    ['/shipping/orders', 'pickerId', '7'],
    ['/shipping/orders', 'shipByFrom', '2026-09-28'],
    ['/shipping/orders', 'shipByTo', '2026-09-30'],
    ['/shipping/orders', 'orderFrom', '2026-09-01'],
    ['/shipping/orders', 'orderTo', '2026-09-27'],
    ['/shipping/shortage', 'pickedBy', '7'],
    ['/shipping/shortage', 'shipByTo', '2026-09-30'],
    ['/shipping/orders', 'sort', 'ship_by'],
    ['/shipping/orders', 'dir', 'asc'],
    ['/fulfilled', 'pickedBy', '7'],
    ['/fulfilled', 'timeFrom', '09:00'],
    ['/fulfilled', 'timeTo', '23:59'],
    ['/fulfilled', 'shippedFilter', 'orders'],
    ['/fulfilled', 'carrier', 'UPS'],
    ['/fulfilled', 'statusCategory', 'delivered'],
    ['/fulfilled', 'exceptions', '1'],
    ['/fulfilled', 'dateFrom', '2026-09-01'],
    ['/fulfilled', 'dateTo', '2026-09-26'],
    ['/fulfilled', 'shippedWeekOffset', '2'],
  ];

  for (const [pathname, key, value] of samples) {
    assert.ok(at(pathname).params.includes(key), `${pathname} must advertise ${key}`);
    const spec = routeParamsFor(pathname);
    assert.ok(spec, pathname);
    assert.equal(parseRouteParams(spec, new URLSearchParams({ [key]: value })).get(key), value, `${pathname} strips ${key}=${value}`);
  }
});

test('a pasted list and its bucket filter survive every Shipping view, past the free-text cap', () => {
  // 40 order numbers ≈ 600 chars — longer than a text param may be.
  const refs = Array.from({ length: 40 }, (_, i) => `02-${15200 + i}-${40000 + i}`).join(',');
  for (const href of ['/shipping/orders', '/fulfilled']) {
    const locate = at(href).search.locate;
    assert.ok(locate, `${href} locates a pasted list`);
    assert.equal(locate.locator, 'outbound');
    const spec = routeParamsFor(new URL(href, 'http://t').pathname);
    assert.ok(spec, href);
    const kept = parseRouteParams(spec, new URLSearchParams({ [locate.param]: refs, [locate.statusParam]: 'shipped' }));
    assert.equal(kept.get(locate.param), refs, `${href} strips the pasted list`);
    assert.equal(kept.get(locate.statusParam), 'shipped', `${href} strips the bucket filter`);
  }
  const noOrders = new Set([...ALL].filter((permission) => permission !== 'orders.view'));
  const denied = at('/fulfilled', { permissions: noOrders });
  assert.equal(denied.search.scope, 'outbound.shipped');
  assert.equal(denied.search.locate, undefined, 'no locate without the desk lists');
});

test('a 150-number pasted list and its status + reason filters survive the Inbound desk', () => {
  // 150 tracking-length numbers ≈ 3KB — the paste cap, far past a text param.
  const refs = Array.from({ length: 150 }, (_, i) => `1Z999AA1${String(10_000_000 + i)}`).join(',');
  const locate = at('/incoming').search.locate;
  assert.ok(locate?.facetParam, '/incoming locates a pasted list with a reason filter');
  // The sidebar's bucket + reason rows write the params the search's pasted list reads.
  assert.deepEqual(at('/incoming').controls?.pastedListBuckets, { param: locate.statusParam, facetParam: locate.facetParam });
  const spec = routeParamsFor('/incoming');
  assert.ok(spec);
  const kept = parseRouteParams(
    spec,
    new URLSearchParams({ [locate.param]: refs, [locate.statusParam]: 'not_received', [locate.facetParam]: 'in_transit' }),
  );
  assert.equal(kept.get(locate.param), refs, 'the pasted list is stripped');
  assert.equal(kept.get(locate.statusParam), 'not_received');
  assert.equal(kept.get(locate.facetParam), 'in_transit');
});

test('each Shipping view carries the filters and controls its own list reads', () => {
  const shipped = at('/fulfilled');
  assert.equal(shipped.filters?.facetContext, 'outbound.shipped');
  assert.deepEqual(
    shipped.filters?.groups.map((group) => group.param),
    ['shippedFilter', 'channel', 'carrier', 'statusCategory', 'exceptions', 'cardStatus'],
  );
  // Who touched it, and when — each a button in the body, each a param the list reads.
  const shippedControls = navControlParams(shipped.controls);
  for (const key of ['staff', 'pickedBy', 'packedBy', 'dateFrom', 'dateTo', 'timeFrom', 'timeTo']) {
    assert.ok(shippedControls.includes(key), `shipped control ${key}`);
  }
  const allocate = at('/shipping/orders').controls;
  const allocateControls = navControlParams(allocate);
  for (const key of ['staff', 'pickedBy', 'shipByFrom', 'shipByTo', 'orderFrom', 'orderTo', 'sort', 'dir']) {
    assert.ok(allocateControls.includes(key), `Allocate control ${key}`);
  }
  // "What to ship first": the queue's default order is ship-by, soonest first.
  assert.equal(allocate?.sort?.defaultValue, 'deadline');
  // Exceptions owns its controls and filtering only on the global page.
  assert.equal(at('/exceptions').page.id, 'exceptions');
});

test('each Inbound view carries the filters and controls its own list reads, and its saved views keep them', () => {
  const pipeline = at('/incoming');
  const docked = at('/incoming?lane=docked');
  const unboxed = at('/incoming?lane=unboxed');
  assert.deepEqual(
    getSidebarPageNav('incoming')?.children?.map((child) => child.label),
    ['Inbound', 'Docked', 'Unboxed'],
    'Deliveries owns exactly three parent-to-child views',
  );
  const cases = [
    // On the way: the purchasing source the list endpoint takes, the ledger's column order.
    { href: '/incoming', ctx: pipeline, reads: ['inbound', 'colsort', 'coldir'], isColumn: isIncomingGridSortable },
    // Docked: who arrival-scanned it, the arrival window, intake kind and card order.
    {
      href: '/incoming?lane=docked',
      ctx: docked,
      reads: ['staff', 'dateFrom', 'dateTo', 'dkind', 'colsort', 'coldir'],
      isColumn: isReceivingGridSortable,
    },
    // Unboxed: the same control grammar over a separate Unbox-opened population.
    {
      href: '/incoming?lane=unboxed',
      ctx: unboxed,
      reads: ['staff', 'dateFrom', 'dateTo', 'dkind', 'colsort', 'coldir'],
      isColumn: isReceivingGridSortable,
    },
  ];
  for (const { href, ctx, reads, isColumn } of cases) {
    const keys = navControlParams(ctx.controls);
    for (const key of reads) {
      assert.ok(keys.includes(key), `${href} control ${key}`);
      assert.ok(ctx.savedViews?.paramKeys.includes(key), `${href}: a saved view drops ${key}`);
    }
    // Every non-default order is a column the ledger actually sorts by.
    const sort = ctx.controls?.sort;
    assert.ok(sort, href);
    for (const option of sort.options) {
      if (option.value !== sort.defaultValue) assert.ok(isColumn(option.value), `${href}: sort ${option.value} is no column`);
    }
    // Every choice value survives the route's hygiene.
    const spec = routeParamsFor('/incoming');
    assert.ok(spec);
    for (const choice of ctx.controls?.choices ?? []) {
      for (const option of choice.options) {
        const kept = parseRouteParams(spec, new URLSearchParams({ [choice.param]: option.value }));
        assert.equal(kept.get(choice.param), option.value, `${href} strips ${choice.param}=${option.value}`);
      }
    }
  }
  // Picking a History window replaces the old week pill.
  assert.deepEqual(docked.controls?.dateRanges?.[0]?.clearParams, ['weekOffset']);
  // One param, one control: the attention pills own `?dflag=`, so no sidebar row
  // writes it — but a saved view still keeps the pills' cut.
  assert.ok(!navControlParams(docked.controls).includes('dflag'));
  assert.ok(docked.savedViews?.paramKeys.includes('dflag'));
  // Neither lane advertises the other's filters.
  assert.ok(!navControlParams(pipeline.controls).includes('dflag'));
  assert.ok(!navControlParams(docked.controls).includes('inbound'));
  assert.ok(!navControlParams(unboxed.controls).includes('inbound'));
  // Unboxed's attention pills are its Status facet (ruling A4) — the one writer of `?dflag=`.
  assert.deepEqual(unboxed.filters?.groups.map((group) => group.param), ['dflag']);
  assert.ok(unboxed.savedViews?.paramKeys.includes('dflag'));
});

test('the Unbox station: one context for every tab — its status cuts are facets, its Sort only what every tab sorts by', () => {
  const station = at('/unbox');
  assert.equal(station.filters?.facetContext, 'receive');
  assert.deepEqual(station.filters?.groups.map((group) => group.param), ['dflag', 'ukpi']);
  const sort = station.controls?.sort;
  assert.ok(sort);
  // Unset is each tab's own order; every other option is a column the cards, the Unboxed and the Inbound ledgers sort by.
  for (const option of sort.options) {
    if (option.value === sort.defaultValue) continue;
    assert.ok(isReceivingGridSortable(option.value) && isIncomingGridSortable(option.value), `sort ${option.value}`);
  }
  assert.deepEqual(station.controls?.choices ?? [], [], 'Inbound’s Source is no /unbox param');
});

test('every facet context names a real page or section view, and every recents surface exists', () => {
  // `<pageId>` for a page's root (a station), `<pageId>.<itemId>` for a view —
  // on the page's panel, or under one of its own modes. A page's own MODE's
  // context is the count its card paints (`NavModeSwitcher`), never a list's
  // filters: the mode opens its first view.
  for (const context of NAV_FACET_CONTEXTS) {
    // The archive kept the packer-log facet contract when it left FBM.
    if (context === 'outbound.shipped') {
      assert.equal(at('/fulfilled').filters?.facetContext, context, context);
      continue;
    }
    const [pageId, itemId] = context.split('.');
    const page = getSidebarPageNav(pageId ?? '');
    assert.ok(page, context);
    const stops = [at(page.href), ...pageStops(page.id).map((stop) => stop.context)];
    const item = itemId === undefined ? null : stops.flatMap(items).find((row) => row.id === itemId);
    assert.ok(itemId === undefined || item, `${context}: no ${itemId} row on ${pageId}`);
    const isMode = stops.some((stop) => stop.sections.some((section) => isPageModeSection(stop)(section) && section.items.some((row) => row.id === itemId)));
    if (!isMode) assert.equal(at(item?.href ?? page.href).filters?.facetContext, context, context);
  }
  const surfaces = new Set<string>(NAV_RECENT_SURFACE_IDS);
  for (const { href, ctx } of everyContext()) {
    if (ctx.recents) assert.ok(surfaces.has(ctx.recents.surface), `${href}: ${ctx.recents.surface}`);
  }
});

test('FBM owns Allocate and Labels & docs, while Exceptions stays global', () => {
  assert.deepEqual(getSidebarPageNav('outbound')?.children?.map((child) => child.id), ['orders', 'label-intake']);
  assert.deepEqual(itemIds(at('/shipping/orders')), ['outbound', 'fulfilled', 'fba', 'orders', 'label-intake']);
  // The lane map door and the FBM mode card both land on Allocate.
  assert.equal(items(at('/unbox', { view: 'top' })).find((item) => item.id === 'outbound')?.href, '/shipping/orders');
  const modes = at('/fulfilled').sections.find(isLanePageSection);
  assert.equal(modes?.items.find((item) => item.id === 'outbound')?.href, '/shipping/orders');
  assert.deepEqual(activeIds(at('/shipping/orders')).filter((id) => id !== 'outbound'), ['orders']);
  const uploads = at('/shipping/label-intake');
  assert.deepEqual(activeIds(uploads).filter((id) => id !== 'outbound'), ['uploads']);
  const terminalViews = uploads.sections.filter((section) => !isLanePageSection(section)).flatMap((section) => section.items);
  assert.deepEqual(terminalViews.map((item) => item.id), ['orders', 'uploads', 'labels', 'paperwork']);
  assert.equal(terminalViews[0]?.label, 'Allocate');
  assert.equal(uploads.viewKeys, true, 'Allocate and Labels & docs terminal views keep numeric shortcuts');
  assert.ok(!itemIds(at('/shipping/orders')).includes('exceptions'));
  // No Pick list and no PO paired row anywhere in FBM's nav; the parked Shortage desk lights no view.
  for (const href of ['/shipping/orders', '/shipping/shortage?pair=po']) {
    const labels = items(at(href)).map((item) => item.label);
    assert.ok(!labels.includes('Pick list') && !labels.includes('PO paired') && !labels.includes('Picking'), href);
  }
  assert.deepEqual(activeIds(at('/shipping/shortage?pair=po')).filter((id) => id !== 'outbound'), []);
});

test('view=top is the ‹ peek: the lane map with the page lit, the page tools kept', () => {
  const peek = at('/shipping/orders', { view: 'top' });
  assert.equal(peek.scope, 'top');
  assert.equal(peek.back, null);
  assert.deepEqual(activeIds(peek), ['outbound']);
  assert.equal(items(peek).find((item) => item.id === 'outbound')?.kind, 'drill');
  assert.equal(peek.search.scope, 'outbound.orders');
  assert.equal(peek.filters?.facetContext, 'outbound.orders');

  const station = at('/unbox');
  assert.equal(station.scope, 'section');
  assert.equal(station.page.label, 'Scan Stations');
  assert.equal(station.back?.label, 'Scan Stations');
  assert.deepEqual(itemIds(station), [
    'stations-live',
    'triage',
    'receive',
    'testing',
    'ready-to-pack',
    'packer',
    'scan-out',
  ]);
  assert.deepEqual(activeIds(station), []);
  assert.equal(station.scanInput?.grammar, 'unbox');
});

test('every floor station shares the Scan Stations parent switcher', () => {
  const cases = [
    ['/stations/live', 'stations-live', null],
    ['/triage', 'triage', 'arrival'],
    ['/unbox', 'receive', 'unbox'],
    ['/test', 'testing', 'testing'],
    ['/pick', 'ready-to-pack', 'station'],
    ['/pack', 'packer', 'pack'],
    ['/shipping/scan-out', 'scan-out', 'scan-out'],
  ] as const;
  const stationIds = cases.map(([, pageId]) => pageId);
  for (const [href, pageId, grammar] of cases) {
    const ctx = at(href);
    assert.equal(ctx.scope, 'section', href);
    assert.equal(ctx.page.id, pageId, href);
    assert.equal(ctx.page.label, 'Scan Stations', href);
    assert.deepEqual(ctx.back, { label: 'Scan Stations', mode: 'local' }, href);
    const stationSection = ctx.sections.find((section) => /\.scan-stations\.modes$/.test(section.id));
    assert.deepEqual(stationSection?.items.map((item) => item.id), stationIds, href);
    assert.equal(ctx.scanInput?.grammar ?? null, grammar, href);
  }
});

test('Repair service is a Receiving mode whose views split tickets by intake channel', () => {
  const modesOf = (ctx: NavContext) => ctx.sections.find(isLanePageSection)?.items.map((item) => item.label);
  const viewsOf = (ctx: NavContext) => ctx.sections.filter((section) => !isLanePageSection(section)).flatMap((section) => section.items);

  const bare = at('/repair');
  assert.equal(bare.page.id, 'repair');
  assert.equal(bare.back?.label, 'Receiving');
  assert.deepEqual(modesOf(bare), ['Deliveries', 'Local Pickup', 'Repair service', 'Sourcing']);
  assert.deepEqual(viewsOf(bare).map((item) => [item.label, item.href, item.active]), [
    ['All repairs', '/repair', true],
    ['Shipped in', '/repair?channel=shipment', false],
    ['Dropped off', '/repair?channel=pickup', false],
  ]);
  assert.equal(bare.viewKeys, true);

  // The status tab rides beside the channel; an unknown channel reads as All.
  assert.deepEqual(viewsOf(at('/repair?channel=pickup&tab=done')).map((item) => item.active), [false, false, true]);
  assert.deepEqual(viewsOf(at('/repair?channel=shipment')).map((item) => item.active), [false, true, false]);
  assert.deepEqual(viewsOf(at('/repair?channel=bogus')).map((item) => item.active), [true, false, false]);

  // Sales shows the same three views under their own heading, same param.
  const sales = at('/dashboard?mode=repairs&channel=pickup');
  const repairs = sales.sections.find((section) => section.label === 'Repair service');
  assert.deepEqual(repairs?.items.map((item) => [item.label, item.active]), [
    ['All repairs', false],
    ['Shipped in', false],
    ['Dropped off', true],
  ]);
});

test('headings never repeat the name of a row beneath them (nav-name law)', () => {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const { href, ctx } of everyContext()) {
    for (const section of ctx.sections) {
      for (const item of section.items) {
        if (section.label) assert.ok(!same(section.label, item.label), `${href}: ${section.label} → ${item.label}`);
        if (ctx.back) assert.ok(!same(ctx.back.label, item.label), `${href}: ‹ ${ctx.back.label} → ${item.label}`);
      }
    }
  }
});

test('the contract never drops a station scan input, whatever the rollout', () => {
  for (const [pageId, rows] of Object.entries(NAV_PARITY)) {
    const missing = uncoveredRows(
      rows.filter((row) => row.kind === 'scanInput'),
      pageStops(pageId),
    );
    assert.deepEqual(missing, [], pageId);
  }
});

test('the parity gate: a page is contextual only when its contract covers every PARITY row', () => {
  assert.deepEqual(
    Object.keys(NAV_CONTEXT_ROLLOUT).sort(),
    SIDEBAR_PAGE_NAV.map((page) => page.id).sort(),
  );
  assert.deepEqual(Object.keys(NAV_PARITY).sort(), Object.keys(NAV_CONTEXT_ROLLOUT).sort());
  for (const [pageId, state] of Object.entries(NAV_CONTEXT_ROLLOUT)) {
    if (state !== 'contextual') continue;
    const gaps = parityGaps(pageId).map((row) => `${row.kind}:${row.id} (${row.source})`);
    assert.deepEqual(gaps, [], `${pageId} is contextual with uncovered PARITY rows`);
  }
});

test('the runtime gate: a contextual override resolves contextual only with complete parity', () => {
  for (const page of LIVE_PAGES) {
    const href = page.href;
    const asked = at(href, { rolloutOverrides: { [page.id]: 'contextual' } });
    const portable = parityGaps(asked.page.id).length === 0 && !NAV_CONTEXT_PINNED_LEGACY.has(asked.page.id);
    assert.equal(asked.rollout, portable ? 'contextual' : 'legacy', `${page.id} (${portable ? 'portable' : 'gaps or station'})`);
    assert.equal(at(href, { rolloutOverrides: { [page.id]: 'legacy' } }).rollout, 'legacy', page.id);
  }
});

test('ported scan stations use contextual navigation without dropping scan contracts', () => {
  const ported = new Set(['stations-live', 'triage', 'receive', 'testing', 'ready-to-pack', 'packer']);
  const stations = SIDEBAR_PAGE_NAV.filter((page) => page.kind === 'station');
  assert.ok(stations.some((page) => page.id === 'packer'), 'Packing is a station');
  for (const page of stations) {
    if (!ported.has(page.id)) continue;
    assert.equal(NAV_CONTEXT_ROLLOUT[page.id], 'contextual', page.id);
    const ctx = at(page.href);
    assert.equal(ctx.rollout, 'contextual', `${page.id} is ported`);
    if (page.id !== 'stations-live') assert.ok(ctx.scanInput, `${page.id} keeps its scan contract`);
  }
  assert.equal(at('/shipping/orders', { rolloutOverrides: { outbound: 'contextual' } }).rollout, 'contextual');
});

test('the gate has teeth: a param counts only on the view whose route keeps it', () => {
  const shipping = pageStops('outbound');
  const row = { kind: 'param', id: 'record', source: 'test' } as const;
  // Neither visible FBM destination owns the legacy Exceptions record param.
  assert.equal(uncoveredRows([{ ...row, view: 'exceptions' }], shipping).length, 1);
  assert.equal(uncoveredRows([{ ...row, view: 'orders' }], shipping).length, 1);
  // Unbox carries the Unbox grammar; an Arrival scan row is not covered by it.
  assert.equal(uncoveredRows([{ kind: 'scanInput', id: 'arrival', source: 'test' }], pageStops('receive')).length, 1);
});

test('Chat is the first row of the page map for every permission set that can open it', () => {
  const sets: Array<[string, ReadonlySet<string>]> = [
    ['all', ALL],
    ['chat only', new Set(['assistant.chat'])],
    ...[...ALL].filter((p) => p !== 'assistant.chat').map((p): [string, ReadonlySet<string>] => [
      `all but ${p}`,
      new Set([...ALL].filter((q) => q !== p)),
    ]),
  ];
  for (const [name, permissions] of sets) {
    for (const href of ['/', '/incoming', '/ai-chat']) {
      const map = at(href, { permissions, view: 'top' });
      assert.equal(items(map)[0]?.id, 'ai-chat', `${name} @ ${href}`);
    }
  }
  const noChat = new Set([...ALL].filter((p) => p !== 'assistant.chat'));
  assert.ok(!itemIds(at('/', { permissions: noChat })).includes('ai-chat'));
});

test('the parent map paints the Operations band in the ruled order and closes with Print station and Reports', () => {
  const map = at('/', { permissions: ALL, view: 'top' });
  // Operator 2026-10-03: "Operations → Live feed, Scan Stations, Receiving,
  // Fulfillment, Inventory changed to Warehouse … and Products at the bottom."
  // Owner 2026-10-04: Support sits between the Live feed and Scan Stations.
  // Unnamed rows (Sales) keep their relative order between Warehouse and Products.
  assert.deepEqual(
    items(map).slice(0, 13).map((item) => item.label),
    [
      'Chat',
      'Tasks',
      'Automations',
      'Exceptions',
      'Media Library',
      'Live feed',
      'Support',
      'Scan Stations',
      'Receiving',
      'Fulfillment',
      'Warehouse',
      'Sales',
      'Products',
    ],
  );
  assert.deepEqual(items(map).slice(-2).map((item) => item.label), ['Print station', 'Reports']);
});

test('/ai-chat is a contextual page panel: its threads, New chat, Find over the threads', () => {
  const chat = at('/ai-chat?session=a1b2');
  assert.equal(chat.scope, 'section');
  assert.equal(chat.rollout, 'contextual');
  assert.deepEqual(chat.back, { label: 'Chat', mode: 'local' });
  assert.deepEqual(chat.sections, [], 'no views: the threads are the panel');
  assert.deepEqual(chat.recents, {
    endpoint: '/api/nav/recents?surface=assistant.sessions',
    surface: 'assistant.sessions',
    find: true,
    paged: true,
    rowActions: { endpoint: '/api/ai/chat-sessions/{id}', verbs: ['rename', 'delete'] },
    chords: true,
  });
  // ⌘⇧O is the chat body's own chord; ⌘N (Chrome: new window) is never advertised.
  assert.deepEqual(chat.actions, [{ id: 'chat.new', label: 'New chat', intent: 'ai-chat:new', hotkey: 'mod+shift+o' }]);
  const reserved = /^mod\+(n|t|w|[0-9])$/;
  for (const { href, ctx } of everyContext()) {
    for (const action of ctx.actions ?? []) {
      if (action.hotkey) assert.doesNotMatch(action.hotkey, reserved, `${href}: ${action.id}`);
    }
  }
  assert.deepEqual(
    { source: chat.search.source, placeholder: chat.search.placeholder, param: chat.search.param },
    { source: 'desk-store', placeholder: 'Search chats', param: undefined },
  );
  assert.deepEqual(parityGaps('ai-chat'), []);
  // The map drills into the panel.
  assert.equal(items(at('/', { view: 'top' })).find((item) => item.id === 'ai-chat')?.kind, 'drill');

  // No door, no threads: the map, and nothing of Chat's leaks onto it.
  const noChat = at('/ai-chat', { permissions: new Set([...ALL].filter((p) => p !== 'assistant.chat')) });
  assert.equal(noChat.scope, 'top');
  assert.equal(noChat.recents, undefined);
});

test('contextual sidebars never declare raw operational data lists', () => {
  const declared: Array<{ pageId: string; itemId?: string; surface: string }> = [];
  for (const [pageId, page] of Object.entries(NAV_PAGE_DECLS)) {
    if (page.recents) declared.push({ pageId, surface: page.recents });
    for (const [itemId, item] of Object.entries(page.items ?? {})) {
      if (item.recents) declared.push({ pageId, itemId, surface: item.recents });
    }
  }

  assert.deepEqual(declared, [
    { pageId: 'ai-chat', surface: NAV_SIDEBAR_NAVIGATION_SURFACE },
  ]);
  assert.equal(NAV_PAGE_DECLS['ai-chat']?.recentsPanel, true);
  assert.equal(at('/unbox').recents, undefined, 'Unbox queue rows stay in the central workspace');
});

test('the gate has teeth for recents verbs: a surface without them leaves the row uncovered', () => {
  const labels = pageStops('products');
  assert.equal(uncoveredRows([{ kind: 'rowAction', id: 'rename', source: 'test' }], labels).length, 1);
  assert.equal(uncoveredRows([{ kind: 'paging', id: 'labels.prints', source: 'test' }], labels).length, 1);
  assert.deepEqual(uncoveredRows([{ kind: 'paging', id: 'assistant.sessions', source: 'test' }], pageStops('ai-chat')), []);
});

test('/exceptions wears a mode card like Fulfillment: Fulfillment · Inventory · Receiving, never an "all" mode', () => {
  const views = (ctx: NavContext) =>
    ctx.sections.filter((section) => !isPageModeSection(ctx)(section)).flatMap((section) => section.items).map((item) => [item.id, item.active]);
  const modes = (ctx: NavContext) => ctx.sections.find(isPageModeSection(ctx));
  const modeRows = (ctx: NavContext) => modes(ctx)?.items.map((item) => [item.id, item.label, item.active]);

  // A kind: the back row, the card with its domain current, and the domain's kinds under it — that kind lit.
  const bins = at('/exceptions?domain=inventory&kind=bins');
  assert.equal(bins.scope, 'section');
  assert.deepEqual(bins.back, { label: 'Exceptions', mode: 'local' });
  assert.equal(bins.sections[0], modes(bins), 'the mode card leads the panel');
  assert.equal(modes(bins)?.id, 'exceptions.modes');
  assert.equal(modes(bins)?.label, 'Domain');
  assert.ok(!bins.sections.some(isLanePageSection), 'never a lane mode card');
  assert.deepEqual(modeRows(bins), [
    ['fulfillment', 'Fulfillment', false],
    ['inventory', 'Inventory', true],
    ['receiving', 'Receiving', false],
  ]);
  assert.deepEqual(views(bins), [
    ['pairs', false],
    ['bins', true],
    ['tracking', false],
  ]);
  assert.deepEqual(items(bins).slice(-3).map((item) => item.href), [
    '/exceptions?domain=inventory&kind=pairs',
    '/exceptions?domain=inventory&kind=bins',
    '/exceptions?domain=inventory&kind=tracking',
  ]);
  assert.equal(bins.viewKeys, true);
  assert.equal(bins.filters?.facetContext, 'exceptions.bins');
  // The same kind without `?domain=` stays in its domain.
  assert.deepEqual(activeIds(at('/exceptions?kind=bins')), ['inventory', 'bins']);

  // A mode opens its FIRST kind — never a blanket domain list; its secondary line names its kinds.
  assert.deepEqual(modes(bins)?.items.map((item) => [item.href, item.description]), [
    ['/exceptions?domain=fulfillment&kind=fbm', 'FBM · Labels & docs · Paperwork · Unmatched scans'],
    ['/exceptions?domain=inventory&kind=pairs', 'Missing pairs · Bin errors · Tracking'],
    ['/exceptions?domain=receiving&kind=claim', 'Claim · Short · Unfound'],
  ]);
  // A URL inside no domain (the page redirects it to a kind) reads as the first domain, no view lit.
  assert.deepEqual(modeRows(at('/exceptions'))?.map(([id, , active]) => [id, active]), [
    ['fulfillment', true],
    ['inventory', false],
    ['receiving', false],
  ]);

  // Permissions: a receiving-only caller sees only the domains and kinds it can open; a mode opens its first OPEN kind.
  const receivingOnly = new Set(['receiving.view']);
  const tracking = at('/exceptions?domain=inventory&kind=tracking', { permissions: receivingOnly });
  assert.deepEqual(itemIds(tracking), ['inventory', 'receiving', 'tracking']);
  assert.deepEqual(modes(tracking)?.items.map((item) => [item.id, item.href, item.description]), [
    ['inventory', '/exceptions?domain=inventory&kind=tracking', 'Tracking'],
    ['receiving', '/exceptions?domain=receiving&kind=claim', 'Claim · Short · Unfound'],
  ]);
  assert.deepEqual(parityGaps('exceptions'), []);
});

test('/operations/live-feed is one root row under the Operations band: no views, no controls, no facets; window params survive', () => {
  // The map: one row, its own section after the lanes; no lane, no door, no mode card.
  const map = at('/operations/live-feed', { view: 'top' });
  const row = map.sections.find((section) => section.id === 'live-feed');
  assert.deepEqual(row?.items.map((item) => [item.id, item.label, item.active]), [['live-feed', 'Live feed', true]]);
  assert.equal(map.sections.some((section) => section.id === 'monitor'), false, 'the Monitor lane stays parked');

  const feed = at('/operations/live-feed?window=week&date=2026-09-30');
  assert.equal(feed.rollout, 'contextual');
  assert.equal(feed.page.id, 'live-feed');
  assert.equal(feed.controls, undefined);
  assert.equal(feed.filters, undefined);
  assert.deepEqual([...feed.params].sort(), ['date', 'open', 'window']);
  assert.deepEqual(parityGaps('live-feed'), []);
});

test('Reports is a top-level parent whose report types and controls live in the contextual sidebar', () => {
  const report = at('/reports?tab=packer&date=2026-09-29&staffId=4&q=adapter');
  assert.equal(report.rollout, 'contextual');
  assert.equal(report.scope, 'section');
  assert.equal(report.search.source, 'url-param');
  assert.equal(report.search.param, 'q');
  assert.deepEqual(itemIds(report), ['packer-day', 'activity']);
  assert.deepEqual(activeIds(report), ['packer-day']);
  assert.deepEqual(navControlParams(report.controls), ['staffId', 'date']);
  assert.equal(report.actionsPlacement, 'sidebar');
  assert.deepEqual(report.actions?.map((action) => action.id), [
    'reports.refresh',
    'reports.export-packing',
    'reports.export-inbound',
    'reports.export-outbound',
  ]);
  assert.deepEqual(parityGaps('reports'), []);
});
