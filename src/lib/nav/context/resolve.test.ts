import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { NAV_FACET_CONTEXTS } from '@/lib/nav/facets/contexts';
import { NAV_RECENT_SURFACE_IDS } from '@/lib/nav/recents/surfaces';
import type { NavDefinition } from '@/lib/nav/org-nav';
import { DESK_VIEWS } from '@/lib/outbound/desk-views';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import {
  APP_SIDEBAR_NAV,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  resolveSidebarChild,
} from '@/lib/sidebar-navigation';
import { NAV_PARITY, pageStops, parityGaps, uncoveredRows } from './parity';
import { declaredRouteParams, type ResolveNavContextInput } from './build';
import { resolveNavContext } from './resolve';
import { NAV_CONTEXT_PINNED_LEGACY, NAV_CONTEXT_ROLLOUT } from './rollout';
import { NavContextSchema, NavItemSchema, navControlParams, type NavContext, type NavItem } from './schema';

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

/** A door lane's pages, painted as its landing page's mode switcher. */
const isLanePageSection = (section: NavContext['sections'][number]): boolean => section.id.endsWith('.modes');

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
        assert.deepEqual(activeIds(ctx), [item.id], item.href);
      }
    }
  }
});

test('every lane-map row lands on its own page, and the peek lights it', () => {
  const map = at('/unbox');
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

test('Outbound is a lane door: one map row, the lane name on its panel, its pages as modes', () => {
  const map = at('/unbox');
  const outbound = map.sections.find((section) => section.id === 'fulfillment');
  assert.deepEqual(outbound?.items.map((item) => [item.id, item.label]), [['outbound', 'Outbound']]);
  assert.equal(outbound?.label, undefined);
  for (const id of ['fba', 'label-intake']) assert.ok(!itemIds(map).includes(id), id);
  // Lit from every page of the lane, not just the landing page.
  assert.deepEqual(activeIds(at('/shipping/fba', { view: 'top' })), ['outbound']);

  const landing = at('/shipping/orders');
  assert.equal(landing.page.label, 'Outbound');
  assert.equal(landing.back?.label, 'Outbound');
  const modes = landing.sections.find(isLanePageSection);
  assert.equal(landing.sections[0], modes, 'modes lead the panel');
  assert.deepEqual(modes?.items.map((item) => [item.id, item.label]), [
    ['outbound', 'Shipping'],
    ['fba', 'FBA'],
    ['label-intake', 'Label intake'],
  ]);
  assert.ok(modes?.items.every((item) => !item.active), 'a mode row never lights a view');

  // Scan Stations sit at the very bottom of the map.
  assert.equal(map.sections.at(-1)?.id, 'floor');
});

test('back is null exactly at top, and never navigates', () => {
  for (const { href, ctx } of everyContext()) {
    assert.equal(ctx.back === null, ctx.scope === 'top', href);
    if (ctx.back) assert.deepEqual(ctx.back, { label: ctx.page.label, mode: 'local' }, href);
  }
});

test('nav items carry no counts', () => {
  const allowed = new Set(['id', 'label', 'href', 'active', 'kind', 'badge']);
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
  const map = itemIds(at('/', { permissions: noReceiving }));
  for (const id of ['triage', 'receive', 'pickup', 'repair', 'incoming']) assert.ok(!map.includes(id), id);
  assert.ok(map.includes('outbound'));

  const noImport = new Set([...ALL].filter((p) => p !== 'orders.import'));
  const verbs = (at('/shipping/orders', { permissions: noImport }).actions ?? []).map((a) => a.id);
  assert.ok(verbs.includes('orders.sync'));
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

  const map = at('/', { orgNav });
  assert.ok(!itemIds(map).includes('fba'));
  assert.equal(items(map).find((i) => i.id === 'products')?.label, 'Catalog desk');
});

test('Picking replaces Pending everywhere the sidebar paints a word', () => {
  for (const { href, ctx } of everyContext()) {
    const words = [
      ctx.page.label,
      ctx.back?.label,
      ctx.search.placeholder,
      ...ctx.sections.flatMap((section) => [section.label, ...section.items.map((item) => item.label)]),
      ...(ctx.actions ?? []).map((action) => action.label),
      ...(ctx.filters?.groups ?? []).map((group) => group.label),
    ];
    for (const word of words) if (word) assert.doesNotMatch(word, /\bpending\b/i, `${href}: "${word}"`);
  }
  const shipping = at('/shipping/orders');
  const picking = shipping.sections.find((section) => section.label === 'Picking');
  assert.deepEqual(picking?.items.map((item) => item.label), ['PO paired', 'Pick list']);
  assert.equal(items(shipping).find((item) => item.id === 'triage')?.label, 'To ship');
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
      for (const key of locate ? [locate.param, locate.statusParam] : []) {
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
    ['/shipping/exceptions', 'category', 'SKU Mapping'],
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

test('each Shipping view carries the filters and controls its own list reads', () => {
  const shipped = at('/shipping/shipped');
  assert.equal(shipped.filters?.facetContext, 'outbound.shipped');
  assert.deepEqual(
    shipped.filters?.groups.map((group) => group.param),
    ['shippedFilter', 'carrier', 'statusCategory', 'exceptions'],
  );
  // Who touched it, and when — each a button in the body, each a param the list reads.
  const shippedControls = navControlParams(shipped.controls);
  for (const key of ['staff', 'pickedBy', 'packedBy', 'testedBy', 'dateFrom', 'dateTo', 'timeFrom', 'timeTo']) {
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

test('every facet context names a real page or section view, and every recents surface exists', () => {
  // `<pageId>` for a page without views (a station), `<pageId>.<itemId>` otherwise.
  for (const context of NAV_FACET_CONTEXTS) {
    const [pageId, itemId] = context.split('.');
    const page = getSidebarPageNav(pageId ?? '');
    assert.ok(page, context);
    const home = at(page.href);
    const item = itemId === undefined ? null : items(home).find((row) => row.id === itemId);
    assert.ok(itemId === undefined || item, `${context}: no ${itemId} row on ${pageId}`);
    assert.equal(at(item?.href ?? page.href).filters?.facetContext, context, context);
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
  assert.equal(station.scope, 'top');
  assert.deepEqual(activeIds(station), ['receive']);
  assert.equal(station.scanInput?.grammar, 'unbox');
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

test('the runtime gate: a contextual override resolves contextual only on a gap-free, non-station page', () => {
  for (const page of LIVE_PAGES) {
    const href = page.href;
    const asked = at(href, { rolloutOverrides: { [page.id]: 'contextual' } });
    const portable = parityGaps(asked.page.id).length === 0 && !NAV_CONTEXT_PINNED_LEGACY.has(asked.page.id);
    assert.equal(asked.rollout, portable ? 'contextual' : 'legacy', `${page.id} (${portable ? 'portable' : 'gaps or station'})`);
    assert.equal(at(href, { rolloutOverrides: { [page.id]: 'legacy' } }).rollout, 'legacy', page.id);
  }
});

test('scan stations stay legacy on desktop even when an override asks for contextual', () => {
  const stations = SIDEBAR_PAGE_NAV.filter((page) => page.kind === 'station');
  assert.ok(stations.some((page) => page.id === 'packer'), 'Packing is a station');
  for (const page of stations) {
    assert.equal(NAV_CONTEXT_ROLLOUT[page.id], 'legacy', page.id);
    const ctx = at(page.href, { rolloutOverrides: { [page.id]: 'contextual' } });
    assert.equal(ctx.rollout, 'legacy', `${page.id} must stay legacy`);
  }
  assert.equal(at('/shipping/orders', { rolloutOverrides: { outbound: 'contextual' } }).rollout, 'contextual');
});

test('the gate has teeth: a param counts only on the view whose route keeps it', () => {
  const shipping = pageStops('outbound');
  const row = { kind: 'param', id: 'category', source: 'test' } as const;
  assert.deepEqual(uncoveredRows([{ ...row, view: 'exceptions' }], shipping), []);
  // `/shipping/orders` does not own `category` — pinned there, it is a gap.
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

test('the gate has teeth for recents verbs: a surface without them leaves the row uncovered', () => {
  const labels = pageStops('products');
  assert.equal(uncoveredRows([{ kind: 'rowAction', id: 'rename', source: 'test' }], labels).length, 1);
  assert.equal(uncoveredRows([{ kind: 'paging', id: 'labels.prints', source: 'test' }], labels).length, 1);
  assert.deepEqual(uncoveredRows([{ kind: 'paging', id: 'assistant.sessions', source: 'test' }], pageStops('ai-chat')), []);
});
