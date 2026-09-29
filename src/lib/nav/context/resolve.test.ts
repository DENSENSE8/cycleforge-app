import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { NAV_FACET_CONTEXTS } from '@/lib/nav/facets/contexts';
import { NAV_RECENT_SURFACE_IDS } from '@/lib/nav/recents/surfaces';
import { NAV_PAGE_DECLS, NAV_SIDEBAR_NAVIGATION_SURFACE } from '@/lib/nav/context/pages';
import type { NavDefinition } from '@/lib/nav/org-nav';
import { DESK_VIEWS } from '@/lib/outbound/desk-views';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import {
  APP_SIDEBAR_NAV,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  resolveSidebarChild,
  spineSectionIdForPage,
} from '@/lib/sidebar-navigation';
import { LANE_DOORS } from '@/lib/nav/lanes';
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
        const modeIds = new Set(ctx.sections.filter(isPageModeSection(ctx)).flatMap((modes) => modes.items.map((mode) => mode.id)));
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
    ['fba', 'FBA'],
    ['label-intake', 'Labels & docs'],
  ]);
  // FBM is Amazon's acronym for every channel we ship ourselves — the mode says so; FBA is the split.
  assert.deepEqual(modes?.items.map((item) => item.description), [
    'Fulfilled by merchant · all channels',
    'Fulfilled by Amazon',
    undefined,
  ]);
  assert.ok(modes?.items.every((item) => !item.active), 'a mode row never lights a view');

  // Scan Stations opens Operations immediately above Sales; fixed utilities close the map.
  const stations = map.sections[1];
  assert.equal(stations?.id, 'floor');
  assert.deepEqual(stations?.items.map((item) => [item.id, item.label, item.kind]), [
    ['receive', 'Scan Stations', 'drill'],
  ]);
  assert.ok(
    map.sections.findIndex((section) => section.id === 'floor') <
      map.sections.findIndex((section) => section.id === 'sales'),
  );
  assert.equal(map.sections.at(-1)?.id, 'bottom');
});

test('the parent map keeps Scan Stations to one door across every station route', () => {
  const stationPaths = ['/triage', '/unbox', '/repair', '/test', '/pick', '/pack', '/shipping/scan-out'];
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
    'label-intake',
    'exceptions',
    'po',
    'pick',
    'triage',
  ]);

  // Only the Shipped archive door: still the Shipping section, one row.
  const shippedOnly = new Set(['shipping.view', 'packing.view']);
  const archive = at('/shipping/shipped', { permissions: shippedOnly });
  assert.equal(archive.scope, 'section');
  assert.deepEqual(itemIds(archive), ['shipped']);

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
          { id: 'orders', order: 0 },
          { id: 'shortage', label: 'Pick queue' },
          { id: 'shipped', hidden: true },
        ],
      },
      { id: 'fba', hidden: true },
      // Not a lane door (a door row wears its lane's name, like Outbound).
      { id: 'products', label: 'Catalog desk' },
    ],
  };
  const shipping = at('/shipping/orders?queue=pick', { orgNav });
  assert.deepEqual(itemIds(shipping), ['outbound', 'label-intake', 'triage', 'exceptions', 'po', 'pick']);
  assert.equal(shipping.sections.find((s) => s.items.some((i) => i.id === 'pick'))?.label, 'Pick queue');

  const map = at('/', { orgNav, view: 'top' });
  assert.ok(!itemIds(map).includes('fba'));
  assert.equal(items(map).find((i) => i.id === 'products')?.label, 'Catalog desk');
});

test('Picking replaces Pending in fulfillment; Picker keeps its Pending queue view', () => {
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
  const shipping = at('/shipping/orders');
  const picking = shipping.sections.find((section) => section.label === 'Picking');
  assert.deepEqual(picking?.items.map((item) => item.label), ['PO paired', 'Pick list']);
  assert.equal(items(shipping).find((item) => item.id === 'triage')?.label, 'Allocate');
  // The old nav agrees: the pick list lights Picking, not To ship.
  const pick = new URL('http://t/shipping/orders?queue=pick');
  assert.equal(resolveSidebarChild('outbound', { pathname: pick.pathname, params: pick.searchParams }), 'shortage');
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
    ['/shipping/exceptions', 'record', 'fbm:42'],
    ['/shipping/shortage', 'pair', 'po'],
    ['/shipping/orders', 'queue', 'pick'],
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
    ['/shipping/shipped', 'pickedBy', '7'],
    ['/shipping/shipped', 'timeFrom', '09:00'],
    ['/shipping/shipped', 'timeTo', '23:59'],
    ['/shipping/shipped', 'shippedFilter', 'orders'],
    ['/shipping/shipped', 'carrier', 'UPS'],
    ['/shipping/shipped', 'statusCategory', 'delivered'],
    ['/shipping/shipped', 'exceptions', '1'],
    ['/shipping/shipped', 'dateFrom', '2026-09-01'],
    ['/shipping/shipped', 'dateTo', '2026-09-26'],
    ['/shipping/shipped', 'shippedWeekOffset', '2'],
  ];
  const advertised = at('/shipping/orders').params;
  for (const [pathname, key, value] of samples) {
    assert.ok(advertised.includes(key), `Shipping must advertise ${key}`);
    const spec = routeParamsFor(pathname);
    assert.ok(spec, pathname);
    assert.equal(parseRouteParams(spec, new URLSearchParams({ [key]: value })).get(key), value, `${pathname} strips ${key}=${value}`);
  }
});

test('a pasted list and its bucket filter survive every Shipping view, past the free-text cap', () => {
  // 40 order numbers ≈ 600 chars — longer than a text param may be.
  const refs = Array.from({ length: 40 }, (_, i) => `02-${15200 + i}-${40000 + i}`).join(',');
  for (const href of ['/shipping/orders', '/shipping/orders?queue=pick', '/shipping/shortage?pair=po', '/shipping/exceptions', '/shipping/shipped']) {
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
  const denied = at('/shipping/shipped', { permissions: noOrders });
  assert.equal(denied.search.scope, 'outbound.shipped');
  assert.equal(denied.search.locate, undefined, 'no locate without the desk lists');
});

test('a 150-number pasted list and its status + reason filters survive the Inbound desk', () => {
  // 150 tracking-length numbers ≈ 3KB — the paste cap, far past a text param.
  const refs = Array.from({ length: 150 }, (_, i) => `1Z999AA1${String(10_000_000 + i)}`).join(',');
  const locate = at('/incoming').search.locate;
  assert.ok(locate?.facetParam, '/incoming locates a pasted list with a reason filter');
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
  const shipped = at('/shipping/shipped');
  assert.equal(shipped.filters?.facetContext, 'outbound.shipped');
  assert.deepEqual(
    shipped.filters?.groups.map((group) => group.param),
    ['shippedFilter', 'carrier', 'statusCategory', 'exceptions'],
  );
  // Who touched it, and when — each a button in the body, each a param the list reads.
  const shippedControls = navControlParams(shipped.controls);
  for (const key of ['staff', 'pickedBy', 'packedBy', 'dateFrom', 'dateTo', 'timeFrom', 'timeTo']) {
    assert.ok(shippedControls.includes(key), `shipped control ${key}`);
  }
  for (const href of ['/shipping/orders', '/shipping/orders?queue=pick', '/shipping/shortage?pair=po']) {
    const controls = at(href).controls;
    const keys = navControlParams(controls);
    for (const key of ['staff', 'pickedBy', 'shipByFrom', 'shipByTo', 'orderFrom', 'orderTo', 'sort', 'dir']) {
      assert.ok(keys.includes(key), `${href} control ${key}`);
    }
    // "What to ship first": the queue's default order is ship-by, soonest first.
    assert.equal(controls?.sort?.defaultValue, 'deadline', href);
  }
  // The Exceptions workbench reads no staff or date param.
  assert.equal(at('/shipping/exceptions').controls, undefined);
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
});

test('every facet context names a real page or section view, and every recents surface exists', () => {
  // `<pageId>` for a page's root (a station), `<pageId>.<itemId>` for a view —
  // on the page's panel, or under one of its own modes. A page's own MODE's
  // context is the count its card paints (`NavModeSwitcher`), never a list's
  // filters: the mode opens its first view.
  for (const context of NAV_FACET_CONTEXTS) {
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

test('every desk view hangs under a Shipping child, so none can silently vanish', () => {
  const children = new Set(getSidebarPageNav('outbound')?.children?.map((child) => child.id));
  for (const view of DESK_VIEWS) assert.ok(children.has(view.navChild), view.id);
  assert.deepEqual(itemIds(at('/shipping/orders')), ['outbound', 'fba', 'label-intake', 'exceptions', 'po', 'pick', 'triage', 'shipped']);
});

test('view=top is the ‹ peek: the lane map with the page lit, the page tools kept', () => {
  const peek = at('/shipping/orders?queue=pick', { view: 'top' });
  assert.equal(peek.scope, 'top');
  assert.equal(peek.back, null);
  assert.deepEqual(activeIds(peek), ['outbound']);
  assert.equal(items(peek).find((item) => item.id === 'outbound')?.kind, 'drill');
  assert.equal(peek.search.scope, 'outbound.pick');
  assert.equal(peek.filters?.facetContext, 'outbound.pick');

  const station = at('/unbox');
  assert.equal(station.scope, 'section');
  assert.equal(station.page.label, 'Scan Stations');
  assert.equal(station.back?.label, 'Scan Stations');
  assert.deepEqual(itemIds(station), [
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

test('every floor station shares the Scan Stations parent switcher without advertising Repair', () => {
  const cases = [
    ['/triage', 'triage', 'arrival'],
    ['/unbox', 'receive', 'unbox'],
    ['/repair', 'repair', undefined],
    ['/test', 'testing', 'testing'],
    ['/pick', 'ready-to-pack', 'station'],
    ['/pack', 'packer', 'pack'],
    ['/shipping/scan-out', 'scan-out', 'scan-out'],
  ] as const;
  const visibleStationIds = [
    'triage',
    'receive',
    'testing',
    'ready-to-pack',
    'packer',
    'scan-out',
  ];
  for (const [href, pageId, grammar] of cases) {
    const ctx = at(href);
    assert.equal(ctx.scope, 'section', href);
    assert.equal(ctx.page.id, pageId, href);
    assert.equal(ctx.page.label, 'Scan Stations', href);
    assert.deepEqual(ctx.back, { label: 'Scan Stations', mode: 'local' }, href);
    const stationSection = ctx.sections.find((section) => /\.scan-stations\.modes$/.test(section.id));
    const expectedIds = pageId === 'repair'
      ? ['triage', 'receive', 'repair', ...visibleStationIds.slice(2)]
      : visibleStationIds;
    assert.deepEqual(stationSection?.items.map((item) => item.id), expectedIds, href);
    assert.equal(ctx.scanInput?.grammar, grammar, href);
  }
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
  const ported = new Set(['triage', 'receive', 'testing', 'ready-to-pack', 'packer']);
  const stations = SIDEBAR_PAGE_NAV.filter((page) => page.kind === 'station');
  assert.ok(stations.some((page) => page.id === 'packer'), 'Packing is a station');
  for (const page of stations) {
    if (!ported.has(page.id)) continue;
    assert.equal(NAV_CONTEXT_ROLLOUT[page.id], 'contextual', page.id);
    const ctx = at(page.href);
    assert.equal(ctx.rollout, 'contextual', `${page.id} is ported`);
    assert.ok(ctx.scanInput, `${page.id} keeps its scan contract`);
  }
  assert.equal(at('/shipping/orders', { rolloutOverrides: { outbound: 'contextual' } }).rollout, 'contextual');
});

test('the gate has teeth: a param counts only on the view whose route keeps it', () => {
  const shipping = pageStops('outbound');
  const row = { kind: 'param', id: 'record', source: 'test' } as const;
  assert.deepEqual(uncoveredRows([{ ...row, view: 'exceptions' }], shipping), []);
  // `/shipping/orders` does not own `record` — pinned there, it is a gap.
  assert.equal(uncoveredRows([{ ...row, view: 'triage' }], shipping).length, 1);
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

test('the parent map places Scan Stations above Sales and closes with Print station and Reports', () => {
  const map = at('/', { permissions: ALL, view: 'top' });
  assert.deepEqual(
    items(map).slice(0, 11).map((item) => item.label),
    [
      'Chat',
      'Daily',
      'Automations',
      'Exceptions',
      'Media Library',
      'Scan Stations',
      'Sales',
      'Receiving',
      'Fulfillment',
      'Inventory',
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
    ['/exceptions?domain=fulfillment&kind=fbm', 'FBM · Labels & docs · Paperwork'],
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

test('Reports is a top-level parent whose report types and controls live in the contextual sidebar', () => {
  const report = at('/reports?tab=packer&date=2026-09-29&staffId=4&q=adapter');
  assert.equal(report.rollout, 'contextual');
  assert.equal(report.scope, 'section');
  assert.equal(report.search.source, 'url-param');
  assert.equal(report.search.param, 'q');
  assert.deepEqual(itemIds(report), ['staff-day', 'packer-day', 'utilization', 'velocity', 'dead-stock', 'tasks', 'activity']);
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
