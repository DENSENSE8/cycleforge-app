import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SIDEBAR_NAV,
  getSidebarNavItems,
  isSidebarRouteMobileRestricted,
  isSidebarNavActive,
  isSidebarTopPinActive,
  isSpineBottomRow,
  isSpineMapTopRow,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  getSidebarHref,
  getSidebarRouteKey,
  getSidebarNavPageId,
  isContextualScanStationRoute,
  permissionForPath,
  hasSidebarContextPanel,
  applyChildTarget,
  resolveSidebarChild,
  stationSubgroupMembers,
  floorStationPages,
  getMasterNavItem,
  masterNavLabelForPath,
  masterNavItemForHref,
  isSpineDeskItem,
  isDeskSpineSection,
  DESK_GROUPS,
  filterPageChildren,
  DESK_SPINE_SECTIONS,
  spineSectionIdForPage,
  MAIN_GROUPS,
} from '@/lib/sidebar-navigation';
import { routeParamsFor } from '@/lib/routing/registry';
import { NAV_PAGE_DECLS } from '@/lib/nav/context/pages';
import { LANE_DOORS } from '@/lib/nav/lanes';

test('incoming has Inbound, Docked and Unboxed, including retired mailbox deep links', () => {
  const page = getSidebarPageNav('incoming');
  assert.deepEqual(page?.children?.map((child) => child.label), ['Inbound', 'Docked', 'Unboxed']);
  assert.equal(resolveSidebarChild('incoming', { pathname: '/incoming', params: new URLSearchParams('view=mailbox') }), 'pipeline');
  assert.equal(resolveSidebarChild('incoming', { pathname: '/incoming', params: new URLSearchParams('lane=docked') }), 'docked');
});

test('getSidebarNavItems applies the MOBILE-FIRST GATE, and nothing else, by default', () => {
  // Dogfood parking is retired, so no rows are filtered for that reason any
  // more. What IS filtered (operator 2026-09-14) is every row in a lane the
  // mobile-first gate hides (Support; Monitor, parked 2026-09-16). The Live feed is a root row, never gated.
  const hidden = new Set(['operations', 'imports', 'support']);
  assert.deepEqual(
    getSidebarNavItems(),
    APP_SIDEBAR_NAV.filter((item) => !hidden.has(item.id)),
  );
  // Hidden, NOT deleted — the routes still resolve for a bookmark, and flipping
  // one `LANE_MOBILE_FIRST` entry restores the row.
  for (const id of hidden) {
    assert.ok(
      APP_SIDEBAR_NAV.some((item) => item.id === id),
      `${id} must stay in the registry — hiding a door is not deleting a surface`,
    );
  }
});

test('Chat leads the tops, followed by Daily, Automations, Exceptions and Print station; Reports remains palette-top', () => {
  const items = getSidebarNavItems();
  const topIds = items.filter((item) => item.kind === 'top').map((item) => item.id);
  // `reports` joined on 2026-09-15 (operator:
  // (`/?mode=tasks`), not a sibling destination (operator 2026-09-22 —
  // Chat moved to the top of the page map on 2026-09-27. Daily now follows it
  // before Automations so the map opens with conversation → today → workflows.
  assert.deepEqual(topIds, [
    'ai-chat',
    'home',
    'studio',
    'exceptions',
    // Print station (owner 2026-09-29): the parent-level page for printing to any computer in the org.
    'print-station',
    'ops-photos',
    'plans-live',
    'settings',
    'reports',
  ]);

  const home = items.find((item) => item.id === 'home');
  assert.ok(home, 'home should ship on prod nav');
  assert.equal(home.kind, 'top', 'home is top-pinned');

  const plans = items.find((item) => item.id === 'plans-live');
  assert.ok(plans, 'plans-live should ship on prod nav');
  assert.equal(plans.kind, 'top', 'plans-live stays a top registry pin (parked from the spine band)');
  assert.equal(plans.label, 'Plans');
  assert.equal(plans.href, '/?mode=forge');
  assert.equal(plans.requires, 'operations.plans.view');

  const aiChat = items.find((item) => item.id === 'ai-chat');
  assert.ok(aiChat, 'ai-chat should ship on prod nav');
  assert.equal(aiChat.kind, 'top', 'ai-chat stays a top registry pin after Plans');
  assert.equal(aiChat.label, 'Chat');

  // Operations and Studio are PARKED (2026-09-16 operator ruling):
  const operations = APP_SIDEBAR_NAV.find((item) => item.id === 'operations');
  assert.ok(operations, 'operations must stay in the registry');
  assert.equal(
    operations.kind === 'main' ? operations.mainGroup : null,
    'monitor',
    'operations belongs to the Monitor drill',
  );
  assert.equal(
    items.some((item) => item.id === 'operations'),
    false,
    'the Monitor lane is parked — no door on any surface',
  );
  // Reports was promoted OUT of the Monitor lane to a parent-level row
  // (2026-09-15), so parking Monitor does not touch it. That promotion is why
  // parking the lane costs the operator nothing they still use.
  assert.equal(
    items.some((item) => item.id === 'reports'),
    true,
    'Reports is a parent-level row and survives Monitor being parked',
  );

  const studioRow = APP_SIDEBAR_NAV.find((item) => item.id === 'studio');
  assert.ok(studioRow, 'studio must stay in the registry');
  // A top row since 2026-09-27 (right under Chat), no longer the last lane.
  assert.equal(studioRow.kind, 'top');
  // UNPARKED 2026-09-23: *"the cron drop to assign tasks from designated tags
  // should be included in the automations display in the sidebar"*. The row is
  // the door that display hangs from, so it ships — Monitor above does not.
  assert.equal(
    items.some((item) => item.id === 'studio'),
    true,
    'Automations carries a door (2026-09-23 ruling)',
  );

  // Admin is DISSOLVED: no map row — /admin is a redirect table and permission
  // is `requires` on rows, not a destination.
  assert.equal(items.some((item) => item.id === 'admin'), false, 'admin ships no nav row');

  // Sourcing rides the INBOUND lane (N4, operator 2026-09-14). It is still not
  // nested under Inventory — that 2026-08-03 ruling stands; only the lane it
  // shares changed, and the row itself is untouched.
  const sourcing = items.find((item) => item.id === 'sourcing');
  assert.ok(sourcing, 'sourcing should ship on prod nav');
  assert.equal(sourcing.kind, 'domain');
  assert.equal(
    sourcing.kind === 'domain' ? sourcing.domainGroup : null,
    'inbound',
    'sourcing belongs to the Inbound lane',
  );
  assert.notEqual(
    sourcing.kind === 'domain' ? sourcing.domainGroup : null,
    'inventory',
    'sourcing must not nest under Inventory (2026-08-03)',
  );
  const pickup = items.find((item) => item.id === 'pickup');
  assert.ok(pickup, 'Local Pickup should ship on prod nav');
  assert.equal(pickup.kind, 'domain');
  assert.equal(
    pickup.kind === 'domain' ? pickup.domainGroup : null,
    'inbound',
    'Local Pickup is an Inbound lane mode, not a Scan Station',
  );
});

test('plans-live pin requires operations.plans.view', () => {
  const without = getSidebarNavItems({ permissions: new Set(['photos.view', 'dashboard.view']) });
  assert.equal(
    without.some((item) => item.id === 'plans-live'),
    false,
    'plans-live drops without operations.plans.view',
  );

  const withPlans = getSidebarNavItems({
    permissions: new Set(['photos.view', 'dashboard.view', 'operations.plans.view']),
  });
  assert.equal(
    withPlans.some((item) => item.id === 'plans-live'),
    true,
    'plans-live ships with operations.plans.view',
  );
});

test('Exceptions shows to whoever can see ANY exception source, with only the kinds they can see', () => {
  const ids = (permissions: string[]) =>
    getSidebarNavItems({ permissions: new Set(permissions) }).map((item) => item.id);
  // No source permission at all: no door (every child — every domain included — is filtered).
  assert.equal(ids(['photos.view']).includes('exceptions'), false);
  // One source is enough: receiving alone opens the hub.
  assert.equal(ids(['receiving.view']).includes('exceptions'), true);

  const page = getSidebarPageNav('exceptions');
  assert.ok(page, 'exceptions must be a registered page');
  const receivingOnly = filterPageChildren(page, new Set(['receiving.view']));
  assert.deepEqual(
    receivingOnly.children?.map((child) => child.id),
    ['inventory', 'receiving', 'tracking', 'claim', 'short', 'unfound'],
    'a domain survives on ANY of its kinds (requiresAny: Tracking keeps Inventory); each kind on its own',
  );
  assert.deepEqual(
    filterPageChildren(page, new Set(['packing.view'])).children?.map((child) => child.id),
    ['fulfillment', 'unmatched'],
    'packing alone opens Fulfillment for its Unmatched scans (the Fulfilled unmatched view’s permission)',
  );
  assert.deepEqual(filterPageChildren(page, new Set(['photos.view'])).children, []);
});

test('the fixed spine band leads with daily work; Print station and Reports are fixed at the bottom', () => {
  const items = getSidebarNavItems();
  const mapTopIds = items.filter(isSpineMapTopRow).map((item) => item.id);
  // The structural rows above the reorderable lane band:
  assert.deepEqual(mapTopIds, ['ai-chat', 'home', 'studio', 'exceptions', 'ops-photos']);

  const plans = items.find((item) => item.id === 'plans-live');
  const chat = items.find((item) => item.id === 'ai-chat');
  const settings = items.find((item) => item.id === 'settings');
  const printStation = items.find((item) => item.id === 'print-station');
  const reports = items.find((item) => item.id === 'reports');
  assert.ok(plans && chat && settings && printStation && reports);
  assert.equal(isSpineMapTopRow(plans), false);
  assert.equal(settings.kind, 'top');
  assert.equal(isSpineMapTopRow(settings), false);
  assert.equal(isSpineMapTopRow(reports), false);
  assert.equal(isSpineBottomRow(printStation), true);
  assert.equal(isSpineBottomRow(reports), true);

  // Chat is the ONE assistant door: a painted L1 row gated on the chat API's own permission.
  assert.equal(chat.kind, 'top');
  assert.equal(chat.href, '/ai-chat');
  assert.equal(chat.requires, 'assistant.chat');
  assert.equal(isSpineMapTopRow(chat), true);
  assert.equal(getSidebarRouteKey('/ai-chat'), 'ai-chat');

  const withoutChat = getSidebarNavItems({ permissions: new Set(['photos.view', 'dashboard.view', 'operations.view']) });
  assert.equal(withoutChat.some((item) => item.id === 'ai-chat'), false, 'no Chat door for staff the chat API would 403');
  const withChat = getSidebarNavItems({ permissions: new Set(['photos.view', 'dashboard.view', 'assistant.chat']) });
  assert.equal(withChat.some((item) => item.id === 'ai-chat'), true);

  const media = items.find((item) => item.id === 'ops-photos');
  assert.equal(media?.label, 'Media Library');
});

test('getSidebarNavItems omits mobile-restricted routes in mobile mode', () => {
  const navIds = getSidebarNavItems({ mobileRestricted: true }).map((item) => item.id);

  assert.equal(navIds.includes('operations'), false);
  assert.equal(navIds.includes('support'), false);
  assert.equal(navIds.includes('admin'), false);
  // `dashboard` owns no L1 row — its boards are domain modes (D5).
  assert.equal(navIds.includes('dashboard'), false);
  assert.equal(navIds.includes('incoming'), true);
  // FBA rides the Outbound lane on BOTH surfaces (operator 2026-09-14: "it must
  // be the same for the mobile and the desktop"), so it survives mobile mode —
  // `fba` is not in MOBILE_RESTRICTED_SIDEBAR_IDS.
  assert.equal(navIds.includes('fba'), true);
  // Sales history folded into Dashboard L2 — no separate L1 nav row.
  assert.equal(navIds.includes('walk-in'), false);
});

test('prod nav ships every unparked page; parked lanes and redirect surfaces stay off', () => {
  const navIds = new Set(getSidebarNavItems().map((item) => item.id));
  // Dogfood parking is retired:
  assert.equal(navIds.has('sourcing'), true, 'sourcing ships in Overview');
  assert.equal(navIds.has('plans-live'), true, 'plans-live stays in the nav registry');
  assert.equal(navIds.has('ai-chat'), true, 'ai-chat stays in the nav registry');
  assert.equal(navIds.has('fba'), true, 'fba is the Outbound lane’s second row');
  // Studio (Automations) was PARKED 2026-09-16 and UNPARKED 2026-09-23 on the ruling that the designated-tag cron *"should be included in…
  assert.equal(navIds.has('studio'), true, 'Automations ships the row its display hangs from');
  assert.equal(navIds.has('admin'), false, 'admin is dissolved — no nav page');
  // Home is top-pinned; Operations stays an Overview page.
  assert.equal(navIds.has('home'), true, 'home ships as a top-pinned page');
  // Support stays hidden by the mobile-first gate until it is ported; Monitor
  // rejoined it 2026-09-16 (parked by ruling). `APP_SIDEBAR_NAV` still carries
  // every hidden one — route + bookmark live.
  assert.equal(navIds.has('operations'), false, 'the Monitor lane is parked');
  assert.equal(navIds.has('live-feed'), true, 'the Live feed is a root row under the Operations band');
  assert.equal(navIds.has('reports'), true, 'reports is a parent-level row and ships');
  // Its Catalog sub-route rides along as an L2 MODE, not a second flat row.
  assert.equal(navIds.has('studio-catalog'), false, 'studio-catalog owns no spine row');
  assert.equal(
    getSidebarPageNav('studio')?.children?.some((m) => m.id === 'catalog'),
    true,
    'studio/catalog survives as an L2 mode (⌘K + header Mode + URL)',
  );
  // Rules (2026-09-23 ruling) — the automations display the operator asked for.
  // Its NAME matters as much as its existence: the nav name-collision law
  // forbids a child wearing its parent's "Automations".
  const studioRules = getSidebarPageNav('studio')?.children?.find((m) => m.id === 'rules');
  assert.ok(studioRules, 'studio carries a Rules L2 child');
  assert.equal(studioRules.label, 'Rules');
  assert.equal(studioRules.to().pathname, '/studio/automations');
  assert.equal(
    getSidebarPageNav('studio')?.resolveChild?.({
      pathname: '/studio/automations',
      params: new URLSearchParams(),
    }),
    'rules',
    '/studio/automations resolves to the Rules child',
  );
  // Stations + shipping + inventory + warehouse stay visible (receiving family
  // promoted to L1: Arrival / Unbox / Pickup / Repair + Incoming on Desk).
  for (const id of [
    'stations-live',
    'triage',
    'receive',
    'pickup',
    'repair',
    'incoming',
    'outbound',
    'scan-out',
    'testing',
    'ready-to-pack',
    'packer',
    'products',
    'inventory',
  ]) {
    assert.equal(navIds.has(id), true, `${id} should stay on dogfood nav`);
  }
  assert.equal(navIds.has('warehouse'), false, 'Locations folded under Inventory L2');
  assert.equal(navIds.has('receiving'), false, 'parent Receiving L1 is gone — modes are L1');
  assert.equal(navIds.has('tech'), false, 'parent Testing L1 is gone — QC / Ready to Pack are L1');
  // Dashboard + the print hub dissolved into domain homes (D2 / D5): the routes
  // still resolve, the L1 rows do not exist.
  for (const id of ['dashboard', 'print-labels', 'print-documents']) {
    assert.equal(navIds.has(id), false, `${id} must not own a spine row`);
  }
  // Sales is still its own root section (D4) and is desk-only: the desktop
  // door remains visible while the mobile registry continues to omit it.
  assert.equal(
    APP_SIDEBAR_NAV.some((item) => item.id === 'sales'),
    true,
    'Sales is its own root section (D4)',
  );
  assert.equal(navIds.has('sales'), true, 'Sales remains visible as a desk-only lane');
  assert.equal(navIds.has('counter'), false, 'Counter is a Sales child, not an L1 spine row');
  assert.equal(
    getSidebarPageNav('sales')?.children?.some((m) => m.id === 'counter'),
    true,
    'Counter lives under Sales',
  );
});

test('isSidebarRouteMobileRestricted only flags mobile-blocked routes', () => {
  assert.equal(isSidebarRouteMobileRestricted('operations'), true);
  assert.equal(isSidebarRouteMobileRestricted('support'), true);
  assert.equal(isSidebarRouteMobileRestricted('settings'), false);
  assert.equal(isSidebarRouteMobileRestricted('dashboard'), false);
  assert.equal(isSidebarRouteMobileRestricted('fba'), false);
  assert.equal(isSidebarRouteMobileRestricted('unknown'), false);
});

/* ──────────────── Master sidebar nav — page + mode config ──────────────── */

// The invariant that lets the master nav trust the config:
test('every mode round-trips: resolveChild(apply(to(mode))) === mode', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (!page.children || page.children.length === 0) continue;
    for (const mode of page.children) {
      // A mode parent may intentionally share its landing URL with its first
      // saved view; the resolver returns that concrete view, not the parent.
      if (NAV_PAGE_DECLS[page.id]?.modes && page.children.some((child) => child.group === mode.id)) continue;
      // Start from the page's bare href with no params — the cold-link case.
      const { pathname, search } = applyChildTarget(
        { pathname: page.href, params: new URLSearchParams() },
        mode.to(),
      );
      const resolved = resolveSidebarChild(page.id, {
        pathname,
        params: new URLSearchParams(search),
      });
      assert.equal(
        resolved,
        mode.id,
        `${page.id} › ${mode.id} resolved as "${resolved}" from ${pathname}?${search}`,
      );
    }
  }
});

// Round-trip must also hold when unrelated query params are already present.
test('mode round-trip resolves, preserving unrelated params only on un-migrated routes', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (!page.children || page.children.length === 0) continue;
    for (const mode of page.children) {
      if (NAV_PAGE_DECLS[page.id]?.modes && page.children.some((child) => child.group === mode.id)) continue;
      const target = mode.to();
      // A mode legitimately sets/clears its OWN params (e.g.
      const delta = target.params ?? {};
      const seed = new URLSearchParams('openOrderId=42&q=widget');
      const { pathname, search } = applyChildTarget({ pathname: page.href, params: seed }, target);
      const params = new URLSearchParams(search);
      const spec = routeParamsFor(target.pathname);

      if (!spec) {
        if (!('openOrderId' in delta)) assert.equal(params.get('openOrderId'), '42', `${page.id} dropped openOrderId`);
        if (!('q' in delta)) assert.equal(params.get('q'), 'widget', `${page.id} dropped q`);
      } else {
        // A migrated destination CONSTRUCTS its URL, so neither param rides along — not even `q`, which Pickup does own.
        assert.equal(
          params.get('openOrderId'),
          null,
          `${target.pathname} must not carry openOrderId across a mode switch`,
        );
        assert.equal(
          params.get('q'),
          null,
          `${target.pathname} must not carry ?q= across a mode switch`,
        );
      }

      assert.equal(resolveSidebarChild(page.id, { pathname, params }), mode.id);
    }
  }
});

// A switch onto a dashboard board emits only its own delta, so a retired Search handoff (`openOrderId`/`map`/`q`) can never ride along…
test('every dashboard-board mode clears Search-scoped openOrderId/map/q', () => {
  const seed = new URLSearchParams(
    'mode=search&openOrderId=42&map=search&q=05-14897-15602&sort=scanned_newest',
  );
  let checked = 0;
  for (const page of SIDEBAR_PAGE_NAV) {
    for (const mode of page.children ?? []) {
      if (mode.to().pathname !== '/dashboard') continue;
      checked += 1;
      const { search } = applyChildTarget({ pathname: '/dashboard', params: seed }, mode.to());
      const params = new URLSearchParams(search);
      assert.equal(params.get('openOrderId'), null, `${page.id}/${mode.id} should clear openOrderId`);
      assert.equal(params.get('map'), null, `${page.id}/${mode.id} should clear map`);
      assert.equal(params.get('q'), null, `${page.id}/${mode.id} should clear q`);
    }
  }
  // Local Pickup + Repair service's All · Shipped in · Dropped off.
  assert.equal(checked, 4, `expected 4 dashboard-board modes, found ${checked}`);
});

// A page's bare href must resolve to one of its declared modes (its default) —
// unless the page declares its own modes (`NAV_PAGE_DECLS[page].modes`: Exceptions), whose page lands every URL on a view.
test("a page's bare href resolves to a declared mode (its default)", () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    const resolved = resolveSidebarChild(page.id, {
      pathname: page.href,
      params: new URLSearchParams(),
    });
    if (!page.children || page.children.length === 0) {
      assert.equal(resolved, null, `${page.id} is modeless but resolved "${resolved}"`);
      continue;
    }
    if (NAV_PAGE_DECLS[page.id]?.modes && resolved === null) {
      assert.equal(resolved, null, `${page.id}: its bare href names no child; the page redirects it`);
      continue;
    }
    const ids = page.children.map((m) => m.id);
    assert.ok(resolved && ids.includes(resolved), `${page.id} bare href resolved to "${resolved}", not a declared mode`);
  }
});

// Mode ids must be unique within a page (the dropdown + L2 rail key on them).
test('mode ids are unique within each page', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (!page.children) continue;
    const ids = page.children.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `${page.id} has duplicate mode ids`);
  }
});

// Every page id must be a real nav route OR one of the URL-only surfaces that deliberately own no spine row:
const URL_ONLY_PAGE_IDS = new Set(['receiving', 'tech']);

test('SIDEBAR_PAGE_NAV pages are prod-nav or URL-only, with resolvers when modeful', () => {
  const navIds = new Set(APP_SIDEBAR_NAV.map((item) => item.id));
  for (const page of SIDEBAR_PAGE_NAV) {
    assert.ok(
      navIds.has(page.id) || URL_ONLY_PAGE_IDS.has(page.id),
      `${page.id} is neither in APP_SIDEBAR_NAV nor a known URL-only surface`,
    );
    if (page.children && page.children.length > 0) {
      assert.equal(typeof page.resolveChild, 'function', `${page.id} missing resolveChild`);
    }
  }
});

// getSidebarHref must resolve EVERY page id to its route — both the eight modeful pages (from SIDEBAR_PAGE_NAV) and the modeless ones…
test('getSidebarHref resolves every sidebar page to its real route', () => {
  for (const item of APP_SIDEBAR_NAV) {
    assert.equal(getSidebarHref(item.id), item.href, `${item.id} href mismatch`);
  }
  // Pages resolve to their canonical href (modeful or modeless).
  assert.equal(getSidebarHref('operations'), '/operations');
  assert.equal(getSidebarHref('admin'), null, 'admin is dissolved — resolves like any unknown id');
  assert.equal(getSidebarHref('settings'), '/settings');
  assert.equal(getSidebarHref('search'), null, 'search is parked — no page-map door');
  // Unknown ids resolve to null (caller falls back to current path).
  assert.equal(getSidebarHref('nope'), null);
});

// resolveSidebarChild returns null for single-surface pages (no mode row).
// `ai-chat` is registered (its panel is its threads) but declares no modes.
test('resolveSidebarChild returns null for pages without modes', () => {
  assert.equal(getSidebarPageNav('ai-chat')?.children, undefined);
  assert.equal(resolveSidebarChild('ai-chat', { pathname: '/ai-chat', params: new URLSearchParams() }), null);
  assert.equal(resolveSidebarChild('settings', { pathname: '/settings', params: new URLSearchParams() }), null);
  for (const pageId of ['ready-to-pack', 'receive', 'packer']) {
    assert.equal(getSidebarPageNav(pageId)?.children, undefined);
    assert.equal(resolveSidebarChild(pageId, { pathname: '/scan-station', params: new URLSearchParams() }), null);
  }
  // Search is modeless (APP_SIDEBAR_NAV only) — no SIDEBAR_PAGE_NAV entry.
  assert.equal(getSidebarPageNav('search'), undefined);
  assert.equal(resolveSidebarChild('search', { pathname: '/search', params: new URLSearchParams() }), null);
});

test('every floor station mounts its working panel inside the contextual sidebar', () => {
  for (const pathname of [
    '/triage',
    '/unbox',
    '/test',
    '/pick',
    '/pack',
    '/packer',
    '/shipping/scan-out',
  ]) {
    assert.equal(isContextualScanStationRoute(pathname), true, pathname);
  }
  // Receiving modes, not benches.
  assert.equal(isContextualScanStationRoute('/pickup'), false);
  assert.equal(isContextualScanStationRoute('/repair'), false);
  assert.equal(isContextualScanStationRoute('/shipping/fba'), false);
});

// Operations is modeful: bare /operations is Live; ?mode= drives the rest.
test('resolveSidebarChild reads the operations mode', () => {
  const at = (search = '') => ({ pathname: '/operations', params: new URLSearchParams(search) });
  assert.equal(resolveSidebarChild('operations', at()), 'live');
  // `analytics` was RETIRED 2026-09-16 — the mode reported numbers nobody could trust and its one reconcilable read moved to…
  assert.equal(resolveSidebarChild('operations', at('mode=analytics')), 'live');
  assert.equal(resolveSidebarChild('operations', at('mode=history')), 'history');
  assert.equal(resolveSidebarChild('operations', at('mode=signals')), 'signals');
  // `plans` is no longer an Operations mode (forge/plans moved to Home, HOME-OPS
  // §3.2) — a stale `?mode=plans` link resolves to the Live default here and is
  // redirected to Home by OperationsWorkspace.
  assert.equal(resolveSidebarChild('operations', at('mode=plans')), 'live');
  assert.equal(resolveSidebarChild('operations', at('mode=bogus')), 'live');
});

// The Pack surface + its legacy alias both resolve to the `packer` nav key so the
// sidebar item stays active across the migration.
test('getSidebarRouteKey maps the Pack surface + legacy alias to packer', () => {
  assert.equal(getSidebarRouteKey('/pack'), 'packer');
  assert.equal(getSidebarRouteKey('/pack/'), 'packer');
  assert.equal(getSidebarRouteKey('/packer'), 'packer');
});

test('getSidebarNavPageId keeps Packing as the MasterNav L1 on /pack', () => {
  assert.equal(getSidebarNavPageId('/pack'), 'packer');
  assert.equal(getSidebarNavPageId('/packer'), 'packer');
});

// Spot-check the gnarly real-world deep-links the panels read today, so the
// resolver provably matches existing behavior (deep-link parity).
test('resolver matches existing panel derivations for known deep-links', () => {
  const at = (pathname: string, search = '') =>
    ({ pathname, params: new URLSearchParams(search) });

  // Receiving: mode param drives it; default receive. (The former unfound
  // sub-path was relocated to Admin › PO Mailbox.)
  assert.equal(resolveSidebarChild('receiving', at('/receiving', 'mode=incoming')), 'incoming');
  assert.equal(resolveSidebarChild('receiving', at('/receiving', 'mode=pickup')), 'pickup');
  assert.equal(resolveSidebarChild('receiving', at('/receiving')), 'receive');
  // Unbox + Triage are now their own first-class surface routes — resolved
  // path-based, even with a deep-link param present.
  assert.equal(resolveSidebarChild('receiving', at('/unbox')), 'receive');
  assert.equal(resolveSidebarChild('receiving', at('/unbox', 'recvId=123')), 'receive');
  assert.equal(resolveSidebarChild('receiving', at('/triage')), 'triage');
  assert.equal(resolveSidebarChild('receiving', at('/triage', 'triview=unfound')), 'triage');
  assert.equal(resolveSidebarChild('receiving', at('/incoming')), 'incoming');
  assert.equal(resolveSidebarChild('receiving', at('/incoming', 'state=IN_TRANSIT')), 'incoming');
  // Pickup + History graduated to their own routes (Phase 9) — resolved path-based (`/receiving/history` must beat the `/receiving` params…
  assert.equal(resolveSidebarChild('receiving', at('/pickup')), 'pickup');
  assert.equal(resolveSidebarChild('receiving', at('/repair')), 'repair');
  assert.equal(resolveSidebarChild('receiving', at('/receiving', 'mode=repair')), 'repair');
  assert.equal(getSidebarRouteKey('/pickup'), 'receiving');
  assert.equal(getSidebarRouteKey('/repair'), 'receiving');
  assert.equal(getSidebarRouteKey('/receiving/history'), 'receiving');
  // MasterNav L1 identity — promoted receiving stations (not the family key).
  assert.equal(getSidebarNavPageId('/unbox'), 'receive');
  assert.equal(getSidebarNavPageId('/triage'), 'triage');
  assert.equal(getSidebarNavPageId('/incoming'), 'incoming');
  assert.equal(getSidebarNavPageId('/pickup'), 'pickup');
  assert.equal(getSidebarNavPageId('/repair'), 'repair');
  assert.equal(getSidebarNavPageId('/receiving'), 'receive');
  assert.equal(getSidebarNavPageId('/receiving/history'), 'receive');
  // Catalog owns Products → Labels. It used to resolve to a `print-labels` row
  // so the Print Stations drill would stick — a nav id that was not the page it
  // opened. One URL, one page.
  assert.equal(
    getSidebarNavPageId('/products', new URLSearchParams('view=labels')),
    'products',
  );
  assert.equal(getSidebarNavPageId('/products'), 'products');
  assert.equal(resolveSidebarChild('products', at('/products', 'view=labels')), 'labels');
  assert.equal(resolveSidebarChild('products', at('/products')), 'catalog');
  assert.equal(getSidebarPageNav('print-labels'), undefined);
  assert.equal(getSidebarPageNav('print-documents'), undefined);
  assert.equal(resolveSidebarChild('receive', at('/unbox')), null);
  // FBA sub-modes are `fbaMode` on the FBA desk (legacy `mode=plan` still works
  // for the `/fba` redirect window).
  assert.equal(resolveSidebarChild('fba', at('/shipping/fba')), 'combine');
  assert.equal(resolveSidebarChild('fba', at('/shipping/fba', 'fbaMode=plan')), 'plan');
  assert.equal(resolveSidebarChild('fba', at('/fba', 'mode=plan')), 'plan');
  // Desk Shipping children:
  assert.equal(resolveSidebarChild('outbound', at('/shipping')), 'orders');
  assert.equal(resolveSidebarChild('outbound', at('/shipping', 'mode=ready')), null);
  assert.equal(resolveSidebarChild('outbound', at('/shipping', 'mode=fba')), null);
  // `/shipping/labels` is GONE (route deleted 2026-08-30): on no FBM view, it lights none.
  assert.equal(resolveSidebarChild('outbound', at('/shipping/labels')), null);
  assert.equal(resolveSidebarChild('outbound', at('/shipping/ready')), null);
  assert.equal(resolveSidebarChild('outbound', at('/shipping/fba')), null);
  assert.equal(resolveSidebarChild('outbound', at('/shipping/fba', 'fbaMode=ready')), null);
  // Redirect-window: legacy path still resolves nav key until the edge 308 lands.
  assert.equal(resolveSidebarChild('outbound', at('/outbound', 'mode=ready')), null);
  assert.equal(getSidebarRouteKey('/shipping'), 'outbound');
  assert.equal(getSidebarRouteKey('/outbound'), 'outbound');
  assert.equal(getSidebarRouteKey('/shipping/scan-out'), 'outbound');
  // The route KEY stays `outbound` for panel chrome even where the PAGE is FBA.
  assert.equal(getSidebarRouteKey('/shipping/fba'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/labels'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/ready'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/fba'), 'fba');
  assert.equal(getSidebarNavPageId('/shipping/scan-out'), 'scan-out');
  assert.equal(resolveSidebarChild('scan-out', at('/shipping/scan-out')), null);
  // Dashboard: Shipping (id `outbound`) is the default — `?shipped`, `?unshipped`, legacy `?pending`, and bare all resolve to it.
  const dashPage = (search = '') =>
    getSidebarNavPageId('/dashboard', new URLSearchParams(search));
  assert.equal(dashPage(), 'outbound');
  assert.equal(dashPage('shipped='), 'outbound');
  assert.equal(dashPage('pending='), 'outbound');
  assert.equal(dashPage('mode=search'), 'outbound');
  assert.equal(dashPage('mode=inbound'), 'incoming');
  assert.equal(dashPage('mode=receiving'), 'incoming');
  assert.equal(dashPage('mode=sales'), 'sales');
  assert.equal(dashPage('mode=pickup'), 'sales');
  assert.equal(dashPage('mode=repairs'), 'sales');
  assert.equal(getSidebarNavPageId('/shipping/orders'), 'outbound');
  assert.equal(
    getSidebarNavPageId('/shipping/orders', new URLSearchParams('context=support')),
    'support',
  );
  assert.equal(getSidebarPageNav('dashboard'), undefined, 'no dashboard L1 page nav');
  // Review implementations stay in-tree, but no page-nav child launches them.
  assert.equal(getSidebarPageNav('review'), undefined);
  assert.equal(
    getSidebarPageNav('operations')?.children?.some((child) => child.id === 'packing-review'),
    false,
  );
  // The retained Products pairing view remains independent of Review.
  assert.deepEqual(
    getSidebarPageNav('products')?.children?.map((c) => c.id),
    ['catalog', 'manuals', 'labels', 'pairing', 'qc'],
  );
  // The desk's tab band, in order — Allocate (child `orders`) leads: FBM lands there.
  assert.deepEqual(
    getSidebarPageNav('outbound')?.children?.map((c) => c.id),
    ['orders', 'exceptions'],
  );
  assert.equal(getSidebarPageNav('outbound')?.href, '/shipping/orders');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/shortage', 'pair=po')), null);

  // Every desk's views are its nav children — the contextual sidebar paints
  // them (owner 2026-09-28: no desk draws an inline tab row). Inbound's are
  // its two lanes: bare `/incoming` and `?lane=docked`.
  for (const pageId of ['outbound', 'products', 'inventory', 'sourcing', 'operations', 'sales', 'support', 'incoming']) {
    assert.ok(
      (getSidebarPageNav(pageId)?.children?.length ?? 0) > 1,
      `${pageId} declares its views as nav children`,
    );
  }
  assert.equal(resolveSidebarChild('outbound', at('/dashboard')), 'orders');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/orders')), 'orders');
  // Fulfilled is a sibling page, so no FBM child lights on its archive route.
  assert.equal(resolveSidebarChild('outbound', at('/fulfilled')), null);
  // FBA is a sibling desk in the Outbound lane now — no tab of this band lights
  // on its path, and the FBA page's own resolver owns the highlight instead.
  assert.equal(resolveSidebarChild('outbound', at('/shipping/fba')), null);
  assert.equal(resolveSidebarChild('fba', at('/shipping/fba')), 'combine');
  // Exceptions needs its own clause for the same reason Shipped does: it is a
  // path, and without it the catch-all would light To ship on the workbench.
  assert.equal(resolveSidebarChild('outbound', at('/shipping/exceptions')), 'exceptions');
  // Support alias is unaffected: `?context=support` is a ticket surface on the
  // orders desk and neither tab may claim it.
  assert.equal(
    resolveSidebarChild('outbound', at('/shipping/orders', 'context=support')),
    null,
  );
  // Inbound draws its two lanes as tabs. `/dashboard?mode=inbound` resolves the
  // PAGE id to `incoming` but sits on neither lane — the proxy redirects it, and
  // lighting a tab there would claim the operator is somewhere they are not.
  assert.equal(resolveSidebarChild('incoming', at('/dashboard', 'mode=inbound')), null);
  assert.equal(resolveSidebarChild('incoming', at('/incoming')), 'pipeline');
  assert.equal(resolveSidebarChild('incoming', at('/incoming', 'lane=docked')), 'docked');
  // An unparseable lane is Pipeline, exactly as `parseInboundLane` says.
  assert.equal(resolveSidebarChild('incoming', at('/incoming', 'lane=bogus')), 'pipeline');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=sales')), 'counter');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=pickup')), 'pickup');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=repairs')), 'repairs-all');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=repairs&channel=shipment')), 'repairs-shipped-in');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=repairs&channel=pickup')), 'repairs-dropped-off');
  assert.equal(getSidebarNavPageId('/counter'), 'sales');
  assert.equal(resolveSidebarChild('sales', at('/counter')), 'counter');
  assert.equal(getSidebarNavPageId('/customers'), 'sales');
  assert.equal(resolveSidebarChild('sales', at('/customers')), 'customers');
  assert.equal(resolveSidebarChild('support', at('/support', 'mode=warranty')), 'tickets');
  // To ship was REMOVED from Support (operator ruling 2026-08-31).
  // To ship was REMOVED from Support (operator ruling 2026-08-31). It was the
  assert.equal(resolveSidebarChild('support', at('/support', 'mode=orders')), 'tickets');
  assert.equal(
    resolveSidebarChild('support', at('/shipping/orders', 'context=support')),
    'tickets',
  );
  assert.equal(
    resolveSidebarChild('outbound', at('/shipping/orders', 'context=support')),
    null,
  );
  assert.equal(resolveSidebarChild('support', at('/support')), 'tickets');
  // Quality Control owns `/test` (any `?view=`); the Picker desk owns `/pick` (owner 2026-09-27).
  assert.equal(getSidebarNavPageId('/test'), 'testing');
  assert.equal(getSidebarNavPageId('/test', new URLSearchParams('view=testing')), 'testing');
  assert.equal(getSidebarNavPageId('/test', new URLSearchParams('ship=urgent')), 'testing');
  assert.equal(getSidebarNavPageId('/tech'), 'testing');
  assert.equal(getSidebarNavPageId('/pick'), 'ready-to-pack');
  assert.equal(getSidebarNavPageId('/pick', new URLSearchParams('ship=history')), 'ready-to-pack');
  assert.equal(getSidebarNavPageId('/pickup'), 'pickup');
});

// The Test surface + its legacy alias both resolve to the `tech` nav key so the
// sidebar item stays active across the migration.
test('getSidebarRouteKey maps the Test surface + legacy alias to tech', () => {
  assert.equal(getSidebarRouteKey('/test'), 'tech');
  assert.equal(getSidebarRouteKey('/test/'), 'tech');
  assert.equal(getSidebarRouteKey('/tech'), 'tech');
  assert.equal(getSidebarRouteKey('/pick'), 'pick');
  assert.equal(getSidebarRouteKey('/pickup'), 'receiving');
});

test('getSidebarRouteKey does not treat retired /o as a dedicated workspace', () => {
  // `/o/[id]` redirects to search; route key falls through (unknown / search
  // depending on other matchers — never a ghost `order` panel).
  assert.notEqual(getSidebarRouteKey('/o/6057'), 'order');
  assert.notEqual(getSidebarRouteKey('/o/12-34567-89012'), 'order');
  assert.notEqual(getSidebarRouteKey('/o'), 'order');
});

// `/search` is header find + browse/detail (no context rail) on `?sel=`.
test('Home is rail-less — no context column for Today', () => {
  assert.equal(getSidebarRouteKey('/'), 'home');
  // Pattern E (2026-08-12): saved views moved to Band 3 WorkbenchViewsMenu.
  // Declaring the key without a panel would reserve 360px of empty chrome.
  assert.equal(hasSidebarContextPanel('/'), false);
});

test('/search keeps preserved route metadata but has no master-nav door', () => {
  assert.equal(getSidebarRouteKey('/search'), 'search');
  assert.equal(getSidebarRouteKey('/search/anything'), 'search');
  assert.equal(hasSidebarContextPanel('/search'), false);
  assert.equal(APP_SIDEBAR_NAV.some((item) => item.id === 'search'), false);
  assert.equal(getSidebarRouteKey('/no-such-route'), 'unknown');
});

test('Settings overview is rail-less; Roles and Access keep pickers', () => {
  assert.equal(getSidebarRouteKey('/settings'), 'settings');
  assert.equal(getSidebarRouteKey('/settings/me'), 'settings');
  assert.equal(getSidebarRouteKey('/settings/roles'), 'settings');
  assert.equal(hasSidebarContextPanel('/settings'), false);
  assert.equal(hasSidebarContextPanel('/settings/me'), false);
  assert.equal(hasSidebarContextPanel('/settings/organization'), false);
  assert.equal(hasSidebarContextPanel('/settings/roles'), true);
  assert.equal(hasSidebarContextPanel('/settings/access'), true);
});

test('isSidebarNavActive is pathname-only (query strings do not change the match)', () => {
  assert.equal(isSidebarNavActive('/', '/'), true);
  assert.equal(isSidebarNavActive('/search', '/search'), true);
  assert.equal(isSidebarNavActive('/search/extra', '/search'), true);
  assert.equal(isSidebarNavActive('/ops/photos', '/ops/photos'), true);
  assert.equal(isSidebarNavActive('/ai-chat', '/ai-chat'), true);
  assert.equal(isSidebarNavActive('/dashboard', '/ai-chat'), false);

  // Query on href is stripped — pathname matching stays path-only.
  assert.equal(isSidebarNavActive('/', '/?mode=today'), true);
  assert.equal(isSidebarNavActive('/search', '/?mode=today'), false);

  // Pack / Test / Shipping aliases normalize.
  assert.equal(isSidebarNavActive('/pack', '/pack'), true);
  assert.equal(isSidebarNavActive('/packer', '/pack'), true);
  assert.equal(isSidebarNavActive('/test', '/test'), true);
  assert.equal(isSidebarNavActive('/tech', '/test'), true);
  assert.equal(isSidebarNavActive('/pick', '/test'), false);
  assert.equal(isSidebarNavActive('/pick', '/pick?ship=urgent'), true);
  assert.equal(isSidebarNavActive('/pickup', '/pick?ship=urgent'), false);
  assert.equal(isSidebarNavActive('/shipping/labels', '/shipping'), true);
  assert.equal(isSidebarNavActive('/outbound', '/shipping'), true);

  assert.equal(isSidebarNavActive(null, '/'), false);
});

test('isSidebarTopPinActive: Plans and Home are separate paths, never both current', () => {
  const home = { id: 'home', href: '/' };
  const plans = { id: 'plans-live', href: '/forge' };
  const live = new URLSearchParams('view=live');
  const daily = new URLSearchParams();
  const today = new URLSearchParams('mode=today');

  // Plans left `/` for `/forge` (2026-08-19), so no `?mode=` split is needed:
  // the two pins can no longer collide on one pathname.
  assert.equal(isSidebarTopPinActive(plans, { pathname: '/forge', searchParams: live }), true);
  assert.equal(isSidebarTopPinActive(home, { pathname: '/forge', searchParams: live }), false);

  // Every Home mode lights Home, and none of them lights Plans.
  assert.equal(isSidebarTopPinActive(home, { pathname: '/', searchParams: daily }), true);
  assert.equal(isSidebarTopPinActive(plans, { pathname: '/', searchParams: daily }), false);
  assert.equal(isSidebarTopPinActive(home, { pathname: '/', searchParams: today }), true);
  assert.equal(isSidebarTopPinActive(plans, { pathname: '/', searchParams: today }), false);

  // Off both, neither pin is current.
  assert.equal(isSidebarTopPinActive(home, { pathname: '/search', searchParams: today }), false);
  assert.equal(isSidebarTopPinActive(plans, { pathname: '/search', searchParams: live }), false);
});

test('stationSubgroupMembers groups receiving / testing peers', () => {
  assert.deepEqual(
    stationSubgroupMembers('receiving').map((p) => p.id),
    ['triage', 'receive'],
  );
});

test('floorStationPages is the flat Scan Stations map for the header switcher', () => {
  assert.deepEqual(
    floorStationPages().map((p) => [p.id, p.label]),
    [
      ['stations-live', 'Live feed V2'],
      ['triage', 'Arrival'],
      ['receive', 'Unbox'],
      ['testing', 'Quality Control'],
      ['ready-to-pack', 'Picker'],
      ['packer', 'Packing'],
      ['scan-out', 'Scan out'],
    ],
  );
});

test('Quality Control is the only Testing bench — picking is its own station', () => {
  assert.deepEqual(
    stationSubgroupMembers('testing').map((p) => [p.id, p.label]),
    [['testing', 'Quality Control']],
  );
  assert.equal(getSidebarPageNav('testing')?.href, '/test');
  // The mode-switch family that hosted both on `/test` is gone.
  assert.equal(getSidebarPageNav('tech'), undefined);
});

test('Picker navigation lands on the canonical /pick desk', () => {
  assert.equal(getSidebarPageNav('ready-to-pack')?.href, '/pick');
  assert.equal(
    APP_SIDEBAR_NAV.find((item) => item.id === 'ready-to-pack')?.href,
    '/pick',
  );
  assert.equal(permissionForPath('/pick'), 'picking.view');
  assert.equal(permissionForPath('/test'), 'tech.view');
  assert.equal(permissionForPath('/pickup'), 'receiving.view');
});

test('Live feed is one root row (no lane, no door) either direction\'s gate opens: Outbound · Inbound the views, no statuses', () => {
  const ids = (permissions: string[]) => getSidebarNavItems({ permissions: new Set(permissions) }).map((item) => item.id);
  assert.ok(ids(['packing.view']).includes('live-feed'));
  assert.ok(ids(['receiving.view']).includes('live-feed'));
  assert.ok(!ids(['shipping.view']).includes('live-feed'));
  const row = APP_SIDEBAR_NAV.find((item) => item.id === 'live-feed');
  assert.equal(row?.label, 'Live feed');
  assert.equal(row?.kind, undefined);
  assert.equal(spineSectionIdForPage(row), null);
  assert.equal(Object.values(LANE_DOORS).includes('live-feed'), false);
  assert.equal(MAIN_GROUPS[0].label, 'Monitor');
  assert.equal(getSidebarNavPageId('/operations/live-feed'), 'live-feed');
  assert.equal(getSidebarNavPageId('/operations'), 'operations');
  assert.deepEqual(getSidebarPageNav('live-feed')!.children?.map((child) => [child.id, child.group ?? null]), [
    ['outbound', null],
    ['inbound', null],
  ]);
  const receivingOnly = filterPageChildren(getSidebarPageNav('live-feed')!, new Set(['receiving.view']));
  assert.deepEqual(receivingOnly.children?.map((child) => child.id), ['inbound']);
  const packingOnly = filterPageChildren(getSidebarPageNav('live-feed')!, new Set(['packing.view']));
  assert.deepEqual(packingOnly.children?.map((child) => child.id), ['outbound']);
  assert.ok(!getSidebarPageNav('live-feed')!.children?.some((child) => child.id === 'all'), 'never an "all" direction');
  assert.equal(APP_SIDEBAR_NAV.find((item) => item.id === 'operations')?.label, 'Operations');
});

test('Wave 1 catalog forks: Home paints, studio stays /studio, admin is gone, no automations href', () => {
  const home = APP_SIDEBAR_NAV.find((item) => item.id === 'home');
  assert.equal(home?.kind, 'top');
  assert.equal(home?.spineBand, undefined);
  assert.equal(isSpineMapTopRow(home!), true);

  const studio = APP_SIDEBAR_NAV.find((item) => item.id === 'studio');
  assert.equal(studio?.href, '/studio');
  assert.equal(studio?.label, 'Automations');

  const plans = APP_SIDEBAR_NAV.find((item) => item.id === 'plans-live');
  assert.equal(plans?.href, '/?mode=forge');

  assert.equal(APP_SIDEBAR_NAV.some((item) => item.id === 'admin'), false);
  assert.equal(
    APP_SIDEBAR_NAV.some((item) => item.href === '/automations'),
    false,
  );
  assert.equal(
    APP_SIDEBAR_NAV.some((item) => item.id === 'new-conversation'),
    false,
  );
});

test('desk family helpers: domains + Operations are desks; Studio, benches, Home are not', () => {
  const items = getSidebarNavItems();
  const incoming = items.find((item) => item.id === 'incoming');
  // Read from the REGISTRY, not the gated funnel: `isSpineDeskItem` is a shape
  // question about the row, and Studio is parked out of nav but unchanged
  // (2026-09-16) — same reason Operations is read that way below.
  const studio = APP_SIDEBAR_NAV.find((item) => item.id === 'studio');
  const receive = items.find((item) => item.id === 'receive');
  const home = items.find((item) => item.id === 'home');
  const media = items.find((item) => item.id === 'ops-photos');

  assert.equal(incoming ? isSpineDeskItem(incoming) : false, true);
  // Read from the registry, not the gated funnel: `isSpineDeskItem` is a shape
  // question about the row, and Operations is hidden from nav but unchanged.
  const operationsRow = APP_SIDEBAR_NAV.find((item) => item.id === 'operations');
  assert.equal(operationsRow ? isSpineDeskItem(operationsRow) : false, true);
  assert.equal(studio ? isSpineDeskItem(studio) : true, false);
  assert.equal(receive ? isSpineDeskItem(receive) : true, false);
  assert.equal(home ? isSpineDeskItem(home) : true, false);
  assert.equal(media?.kind, 'top');
  assert.equal(isSpineMapTopRow(media!), true);

  assert.equal(isDeskSpineSection('fulfillment'), true);
  assert.equal(isDeskSpineSection('monitor'), true);
  assert.equal(isDeskSpineSection('floor'), false);
  assert.equal(DESK_GROUPS[0]?.id, 'desks');
  assert.equal(DESK_GROUPS[0]?.label, 'Workspaces');
});

test('masterNavLabelForPath uses APP_SIDEBAR_NAV L1, never desk tabs', () => {
  assert.equal(masterNavLabelForPath('/shipping/orders'), 'FBM');
  assert.equal(masterNavLabelForPath('/shipping/scan-out'), 'Scan out');
  assert.equal(masterNavLabelForPath('/ops/photos'), 'Media Library');
  assert.equal(
    masterNavLabelForPath('/test', new URLSearchParams('view=testing')),
    'Quality Control',
  );
  assert.equal(masterNavLabelForPath('/test'), 'Quality Control');
  assert.equal(masterNavLabelForPath('/pick'), 'Picker');
  assert.equal(masterNavLabelForPath('/unbox'), 'Unbox');
  assert.equal(masterNavLabelForPath('/studio'), 'Automations');
  assert.equal(getMasterNavItem('outbound')?.label, 'FBM');
  assert.equal(getMasterNavItem('scan-out')?.label, 'Scan out');
  // Faced Deliveries since 2026-09-14 — a child never wears its parent's name,
  // and this row lives inside the *Inbound* lane.
  assert.equal(masterNavLabelForPath('/incoming'), 'Deliveries');
  assert.equal(masterNavItemForHref('/pack')?.id, 'packer');
});

/**
 * Operator ruling 2026-09-14:
 * Operator ruling 2026-09-14: *"ensure that all the sidebar names and icons are
 */
test('every desk lane is expandable: 2+ pages, or one page that declares children', () => {
  const lanes = DESK_SPINE_SECTIONS.map((lane) => {
    const pages = SIDEBAR_PAGE_NAV.filter((page) => spineSectionIdForPage(page) === lane.id);
    return { id: lane.id, label: lane.label, pages };
  });

  assert.ok(lanes.length > 0, 'DESK_SPINE_SECTIONS must not be empty or this pins nothing');

  for (const lane of lanes) {
    if (lane.pages.length === 0) continue; // permission-empty lanes never render
    if (lane.pages.length > 1) continue; // header + page rows

    const page = lane.pages[0]!;
    // `spineFlat` is the declared opt-out. Nothing claims it since 2026-09-23,
    // when Automations dropped it to paint its Rules child as a spine row.
    if (page.spineFlat) continue;

    assert.ok(
      (page.children?.length ?? 0) > 0,
      `lane "${lane.label}" holds only "${page.label}", which declares no children — ` +
        'the spine would paint it as a flat row, not a parent that expands',
    );
  }
});

test('the single-page lanes the operator named expand into their desk children', () => {
  // Named verbatim: "for inventory, for products, sales, support, operations".
  const expected: Record<string, string[]> = {
    sales: ['Counter', 'Customers', 'Local Pickup', 'All repairs', 'Shipped in', 'Dropped off'],
  };

  for (const pageId of ['inventory', 'products', 'sales', 'support', 'operations']) {
    const page = getSidebarPageNav(pageId);
    assert.ok(page, `${pageId} must exist in SIDEBAR_PAGE_NAV`);
    assert.ok(
      (page.children?.length ?? 0) > 0,
      `${pageId} must carry children for its lane to expand`,
    );
    const labels = expected[pageId];
    if (labels) {
      assert.deepEqual(
        page.children?.map((child) => child.label),
        labels,
        'Sales is the example the operator gave — its child order is the contract',
      );
    }
  }
});

/** The lane expansion (N4a) made `page.children` PAINT in the spine for the first time — the collapsed-row world never displayed them, so… */
test('lane children are permission-gated: a viewer without walk_in.view gets no Counter row', () => {
  const sales = getSidebarPageNav('sales');
  assert.ok(sales, 'sales must exist');
  const counter = sales.children?.find((child) => child.id === 'counter');
  assert.ok(counter, 'Counter is the gated child this pins');
  assert.equal(counter.requires, 'walk_in.view', 'the gate itself is the contract');

  const withoutWalkIn = filterPageChildren(sales, new Set(['dashboard.view']));
  const ids = withoutWalkIn.children?.map((child) => child.id) ?? [];
  assert.ok(!ids.includes('counter'), 'Counter must be ABSENT, never a row that 403s');

  const withWalkIn = filterPageChildren(sales, new Set(['walk_in.view']));
  assert.ok(
    withWalkIn.children?.some((child) => child.id === 'counter'),
    'granting the permission paints the row',
  );
});

test('filterPageChildren fails CLOSED when no permission set is supplied', () => {
  // `permissions?.has(...) ?? false` — an absent set drops every gated child
  // rather than painting them. A spine rendered before permissions load must
  // under-paint, never over-paint.
  const support = getSidebarPageNav('support');
  assert.ok(support, 'support must exist');
  const gated = support.children?.filter((child) => child.requires) ?? [];
  assert.ok(gated.length > 0, 'support must have gated children or this pins nothing');

  const filtered = filterPageChildren(support, undefined);
  for (const child of gated) {
    assert.ok(
      !filtered.children?.some((kept) => kept.id === child.id),
      `${child.id} is gated on ${child.requires} and must not paint without permissions`,
    );
  }
});
