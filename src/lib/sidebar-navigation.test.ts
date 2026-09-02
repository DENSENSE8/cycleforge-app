import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SIDEBAR_NAV,
  getMasterNavItem,
  masterNavLabelForPath,
  getSidebarNavItems,
  isSidebarRouteMobileRestricted,
  isSidebarNavActive,
  isSidebarTopPinActive,
  isSpineMapTopRow,
  isSpineDeskItem,
  isDeskSpineSection,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  getSidebarHref,
  getSidebarRouteKey,
  getSidebarNavPageId,
  hasSidebarContextPanel,
  isRaillessSurface,
  applyChildTarget,
  resolveSidebarChild,
  stationSubgroupMembers,
  floorStationPages,
  hasDeskPageChrome,
} from '@/lib/sidebar-navigation';
import { routeParamsFor } from '@/lib/routing/registry';

test('getSidebarNavItems returns the full sidebar list by default', () => {
  // Dogfood parking is retired, so no rows are filtered out any more: the
  // default call returns APP_SIDEBAR_NAV verbatim.
  assert.deepEqual(getSidebarNavItems(), APP_SIDEBAR_NAV);
});

test('Home is top-pinned; Operations in Monitor; Sourcing under Inventory; Plans between Media and Chat', () => {
  const items = getSidebarNavItems();
  const topIds = items.filter((item) => item.kind === 'top').map((item) => item.id);
  assert.deepEqual(topIds, ['home', 'search', 'ops-photos', 'plans-live', 'ai-chat', 'settings']);

  const home = items.find((item) => item.id === 'home');
  assert.ok(home, 'home should ship on prod nav');
  assert.equal(home.kind, 'top', 'home is top-pinned above Search');

  const plans = items.find((item) => item.id === 'plans-live');
  assert.ok(plans, 'plans-live should ship on prod nav');
  assert.equal(plans.kind, 'top', 'plans-live stays a top registry pin (parked from the spine band)');
  assert.equal(plans.label, 'Plans');
  assert.equal(plans.href, '/?mode=forge&view=live');
  assert.equal(plans.requires, 'operations.plans.view');

  const aiChat = items.find((item) => item.id === 'ai-chat');
  assert.ok(aiChat, 'ai-chat should ship on prod nav');
  assert.equal(aiChat.kind, 'top', 'ai-chat stays a top registry pin after Plans');
  assert.equal(aiChat.label, 'Chat');

  const operations = items.find((item) => item.id === 'operations');
  assert.ok(operations, 'operations should ship on prod nav');
  assert.equal(
    operations.kind === 'main' ? operations.mainGroup : null,
    'monitor',
    'operations belongs to the Desks drill (monitor)',
  );

  const studio = items.find((item) => item.id === 'studio');
  assert.ok(studio, 'studio should ship on prod nav');
  assert.equal(studio.kind, 'main', 'studio is a map L1, not a footer pin');
  assert.equal(studio.kind === 'main' ? studio.mainGroup : null, 'studio');

  const admin = items.find((item) => item.id === 'admin');
  assert.ok(admin, 'admin should ship on prod nav');
  assert.equal(admin.kind, 'main', 'admin is a map L1, not a footer pin');
  assert.equal(admin.kind === 'main' ? admin.mainGroup : null, 'admin');

  // Sourcing is its own spine domain section (not nested under Inventory).
  const sourcing = items.find((item) => item.id === 'sourcing');
  assert.ok(sourcing, 'sourcing should ship on prod nav');
  assert.equal(sourcing.kind, 'domain');
  assert.equal(
    sourcing.kind === 'domain' ? sourcing.domainGroup : null,
    'sourcing',
    'sourcing belongs to the Sourcing domain section',
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

test('Search, Plans, Chat, and Settings stay in the registry but stay off the spine map', () => {
  const items = getSidebarNavItems();
  const mapTopIds = items.filter(isSpineMapTopRow).map((item) => item.id);
  assert.deepEqual(mapTopIds, ['home', 'ops-photos']);

  const incoming = items.find((item) => item.id === 'incoming');
  const operations = items.find((item) => item.id === 'operations');
  const studio = items.find((item) => item.id === 'studio');
  assert.equal(incoming ? isSpineDeskItem(incoming) : false, true);
  assert.equal(operations ? isSpineDeskItem(operations) : false, true);
  assert.equal(studio ? isSpineDeskItem(studio) : true, false);
  assert.equal(isDeskSpineSection('fulfillment'), true);
  assert.equal(isDeskSpineSection('floor'), false);
  assert.equal(isDeskSpineSection('admin'), false);

  const search = items.find((item) => item.id === 'search');
  const plans = items.find((item) => item.id === 'plans-live');
  const chat = items.find((item) => item.id === 'ai-chat');
  const settings = items.find((item) => item.id === 'settings');
  assert.ok(search && plans && chat && settings);
  assert.equal(search.kind, 'top');
  assert.equal(search.spineBand, false);
  assert.equal(plans.spineBand, false);
  assert.equal(chat.spineBand, false);
  assert.equal(settings.kind, 'top');
  assert.equal(settings.spineBand, false);
  assert.equal(isSpineMapTopRow(search), false);
  assert.equal(isSpineMapTopRow(plans), false);
  assert.equal(isSpineMapTopRow(chat), false);
  assert.equal(isSpineMapTopRow(settings), false);

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
  // /fba is a permanent redirect into Shipping — it owns no spine row.
  assert.equal(navIds.includes('fba'), false);
  // Sales history folded into Dashboard L2 — no separate L1 nav row.
  assert.equal(navIds.includes('walk-in'), false);
});

test('prod nav ships every unparked page; only redirect surfaces stay off', () => {
  const navIds = new Set(getSidebarNavItems().map((item) => item.id));
  // Dogfood parking is retired: Sourcing ships; Search / Plans / Chat stay in
  // the registry (`kind: 'top'`) with spineBand false.
  // `fba` stays off the spine because /fba is a permanent redirect into Shipping,
  // which already owns that surface (no second front door).
  assert.equal(navIds.has('sourcing'), true, 'sourcing ships in Overview');
  assert.equal(navIds.has('plans-live'), true, 'plans-live stays in the nav registry');
  assert.equal(navIds.has('ai-chat'), true, 'ai-chat stays in the nav registry');
  assert.equal(navIds.has('fba'), false, 'fba redirects into Shipping — no spine row');
  // Studio and Admin are map L1 rows (2026-08-29); Settings is parked in the
  // account ⋯ menu. Studio must still be present on prod nav.
  assert.equal(navIds.has('studio'), true, 'studio ships as a live nav page');
  assert.equal(navIds.has('admin'), true, 'admin ships as a live nav page');
  // Home is top-pinned; Operations stays an Overview page.
  assert.equal(navIds.has('home'), true, 'home ships as a top-pinned page');
  assert.equal(navIds.has('operations'), true, 'operations ships as a live Overview page');
  // Its Catalog sub-route rides along as an L2 MODE, not a second flat row.
  assert.equal(navIds.has('studio-catalog'), false, 'studio-catalog owns no spine row');
  assert.equal(
    getSidebarPageNav('studio')?.children?.some((m) => m.id === 'catalog'),
    true,
    'studio/catalog survives as an L2 mode (⌘K + header Mode + URL)',
  );
  // Stations + shipping + inventory + warehouse stay visible (receiving family
  // promoted to L1: Arrival / Unbox / Pickup / Repair + Incoming on Desk).
  for (const id of [
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
  assert.equal(navIds.has('sales'), true, 'Sales is its own root section (D4)');
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
  assert.equal(isSidebarRouteMobileRestricted('admin'), true);
  assert.equal(isSidebarRouteMobileRestricted('dashboard'), false);
  assert.equal(isSidebarRouteMobileRestricted('fba'), false);
  assert.equal(isSidebarRouteMobileRestricted('unknown'), false);
});

/* ──────────────── Master sidebar nav — page + mode config ──────────────── */

// The invariant that lets the master nav trust the config: navigating to a mode
// (the WRITE path, `to()`) and reading the active mode back from the resulting
// URL (the READ path, `resolveChild`) must agree for EVERY mode on EVERY page.
// If a page's URL convention drifts on one side only, this fails loudly.
test('every mode round-trips: resolveChild(apply(to(mode))) === mode', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (!page.children || page.children.length === 0) continue;
    for (const mode of page.children) {
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
//
// Two contracts now, by destination. An UN-MIGRATED route still copies forward,
// so unrelated params survive (the legacy behaviour, and the leak). A route with
// a param spec (`@/lib/routing/registry`) boundary-parses instead, so a param it
// never declared is DROPPED — that is the whole point of the nav/routing slice,
// and `openOrderId=42` landing on `/unbox` was the bug. Either way the mode must
// still resolve.
test('mode round-trip resolves, preserving unrelated params only on un-migrated routes', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (!page.children || page.children.length === 0) continue;
    for (const mode of page.children) {
      const target = mode.to();
      // A mode legitimately sets/clears its OWN params (e.g. Review's Pairing
      // clears `rtab`/`packerLogId`). `applyChildTarget` only preserves params
      // the mode's delta doesn't touch — so assert preservation for those keys
      // only. Such a clear list is load-bearing ONLY while the route has no
      // spec; `route-mode-registry.guard.test.ts` fails the moment one graduates
      // while keeping it.
      const delta = target.params ?? {};
      const seed = new URLSearchParams('openOrderId=42&q=widget');
      const { pathname, search } = applyChildTarget({ pathname: page.href, params: seed }, target);
      const params = new URLSearchParams(search);
      const spec = routeParamsFor(target.pathname);

      if (!spec) {
        if (!('openOrderId' in delta)) assert.equal(params.get('openOrderId'), '42', `${page.id} dropped openOrderId`);
        if (!('q' in delta)) assert.equal(params.get('q'), 'widget', `${page.id} dropped q`);
      } else {
        // A migrated destination CONSTRUCTS its URL, so neither param rides
        // along — not even `q`, which Pickup does own. Ownership governs what a
        // route may HOLD, not what a navigation may carry into it; sibling modes
        // sharing a key (`open`/`sort`/`q`) is exactly why copy-then-parse was
        // not enough.
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

// A switch onto a dashboard board emits only its own delta, so a retired Search
// handoff (`openOrderId`/`map`/`q`) can never ride along into a domain that has
// no use for it — the guarantee that let the hand-written clear lists be
// deleted. The boards now hang off three different domain pages (D5), so the
// assertion walks every mode that targets `/dashboard`.
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
  // Sales Board + Local Pickup + Repair Service (Orders moved to
  // `/shipping/orders`; Inbound Board folded into `/incoming`).
  assert.equal(checked, 3, `expected 3 dashboard-board modes, found ${checked}`);
});

// A page's bare href must resolve to one of its declared modes (its default).
// NB: the default isn't always the leftmost mode — FBA lists plan/combine/
// shipped but defaults to `combine`. The specific defaults are pinned in the
// deep-link spot-check below. Modeless L1 pages (receiving family stations)
// resolve to null.
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

// Every page id must be a real nav route OR one of the URL-only surfaces that
// deliberately own no spine row: `fba` (a permanent redirect into Shipping,
// which keeps its mode registry so legacy `?mode=` deep links still resolve),
// the legacy `receiving` family entry (modes only), and the legacy `tech`
// family (QC / Ready to Pack stickers). Modeful pages carry a resolver.
const URL_ONLY_PAGE_IDS = new Set(['fba', 'receiving', 'tech']);

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

// getSidebarHref must resolve EVERY page id to its route — both the eight
// modeful pages (from SIDEBAR_PAGE_NAV) and the modeless ones (which live only
// in APP_SIDEBAR_NAV). This is the contract the master-nav write path relies on
// so modeless rows don't no-op back to the current pathname.
test('getSidebarHref resolves every sidebar page to its real route', () => {
  for (const item of APP_SIDEBAR_NAV) {
    assert.equal(getSidebarHref(item.id), item.href, `${item.id} href mismatch`);
  }
  // Pages resolve to their canonical href (modeful or modeless).
  assert.equal(getSidebarHref('operations'), '/operations');
  assert.equal(getSidebarHref('admin'), '/admin');
  assert.equal(getSidebarHref('settings'), '/settings');
  assert.equal(getSidebarHref('search'), '/search');
  // Unknown ids resolve to null (caller falls back to current path).
  assert.equal(getSidebarHref('nope'), null);
});

// resolveSidebarChild returns null for single-surface pages (no mode row).
// NB: `support` gained tickets/voicemail/calls modes in SIDEBAR_PAGE_NAV, so it
// is no longer modeless — use `ai-chat`, which lives only in APP_SIDEBAR_NAV.
test('resolveSidebarChild returns null for pages without modes', () => {
  assert.equal(getSidebarPageNav('ai-chat'), undefined);
  assert.equal(resolveSidebarChild('ai-chat', { pathname: '/ai-chat', params: new URLSearchParams() }), null);
  assert.equal(resolveSidebarChild('settings', { pathname: '/settings', params: new URLSearchParams() }), null);
  // Search is modeless (APP_SIDEBAR_NAV only) — no SIDEBAR_PAGE_NAV entry.
  assert.equal(getSidebarPageNav('search'), undefined);
  assert.equal(resolveSidebarChild('search', { pathname: '/search', params: new URLSearchParams() }), null);
});

// Operations is modeful: bare /operations is Live; ?mode= drives the rest.
test('resolveSidebarChild reads the operations mode', () => {
  const at = (search = '') => ({ pathname: '/operations', params: new URLSearchParams(search) });
  assert.equal(resolveSidebarChild('operations', at()), 'live');
  assert.equal(resolveSidebarChild('operations', at('mode=analytics')), 'analytics');
  assert.equal(resolveSidebarChild('operations', at('mode=insights')), 'insights');
  assert.equal(resolveSidebarChild('operations', at('mode=history')), 'history');
  assert.equal(resolveSidebarChild('operations', at('mode=signals')), 'signals');
  // `plans` is no longer an Operations mode (forge/plans moved to Home, HOME-OPS
  // §3.2) — a stale `?mode=plans` link resolves to the Live default here and is
  // redirected to Home by OperationsWorkspace.
  assert.equal(resolveSidebarChild('operations', at('mode=plans')), 'live');
  assert.equal(resolveSidebarChild('operations', at('mode=bogus')), 'live');
});

// Packing is modeless Standard-only in MasterNav. Legacy `?packMode=` may still
// hit the pack surface; resolveSidebarChild returns null without modes.
test('resolveSidebarChild returns null for modeless packer', () => {
  const at = (search = '') => ({ pathname: '/pack', params: new URLSearchParams(search) });
  assert.equal(getSidebarPageNav('packer')?.children, undefined);
  assert.equal(resolveSidebarChild('packer', at()), null);
  assert.equal(resolveSidebarChild('packer', at('packMode=fragile')), null);
  assert.equal(
    resolveSidebarChild('packer', { pathname: '/packer', params: new URLSearchParams() }),
    null,
  );
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
  // Pickup + History graduated to their own routes (Phase 9) — resolved path-based
  // (`/receiving/history` must beat the `/receiving` params fall-through), while the
  // legacy `?mode=` deep-links still resolve for back-compat.
  // Local Pickup + Repair are receiving modes, each on its own graduated route.
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
  assert.equal(resolveSidebarChild('products', at('/products')), 'manuals');
  assert.equal(getSidebarPageNav('print-labels'), undefined);
  assert.equal(getSidebarPageNav('print-documents'), undefined);
  assert.equal(resolveSidebarChild('receive', at('/unbox')), null);
  // FBA sub-modes live under Shipping as fbaMode (legacy mode=plan still works).
  assert.equal(resolveSidebarChild('fba', at('/shipping', 'mode=fba')), 'combine');
  assert.equal(resolveSidebarChild('fba', at('/shipping', 'mode=fba&fbaMode=plan')), 'plan');
  assert.equal(resolveSidebarChild('fba', at('/fba', 'mode=plan')), 'plan');
  // Desk Shipping children: To ship / Amazon Prep. Ready is an FBA stage tab.
  // Scan out is its own floor L1. Labels stopped being a tab on 2026-08-30 —
  // needing a label became a STATE in the To-ship queue.
  assert.equal(resolveSidebarChild('outbound', at('/shipping')), 'orders');
  assert.equal(resolveSidebarChild('outbound', at('/shipping', 'mode=ready')), 'fba');
  assert.equal(resolveSidebarChild('outbound', at('/shipping', 'mode=fba')), 'fba');
  // `/shipping/labels` is GONE (route deleted 2026-08-30). A stale bookmark
  // 404s at the route layer; if anything still asks this resolver about the
  // path it answers `orders`, the desk's default, rather than a child that no
  // longer exists.
  assert.equal(resolveSidebarChild('outbound', at('/shipping/labels')), 'orders');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/ready')), 'fba');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/fba')), 'fba');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/fba', 'fbaMode=ready')), 'fba');
  // Redirect-window: legacy path still resolves nav key until the edge 308 lands.
  assert.equal(resolveSidebarChild('outbound', at('/outbound', 'mode=ready')), 'fba');
  assert.equal(getSidebarRouteKey('/shipping'), 'outbound');
  assert.equal(getSidebarRouteKey('/outbound'), 'outbound');
  assert.equal(getSidebarRouteKey('/shipping/scan-out'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/labels'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/ready'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/fba'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/scan-out'), 'scan-out');
  assert.equal(resolveSidebarChild('scan-out', at('/shipping/scan-out')), null);
  // Dashboard: Shipping (id `outbound`) is the default — `?shipped`,
  // `?unshipped`, legacy `?pending`, and bare all resolve to it. Receiving
  // rides `?mode=inbound` (canonical) or the `?mode=receiving` alias. Sales /
  // Local Pickup / Repairs are the front-desk history domain
  // (`?mode=sales|pickup|repairs`). Warranty Logger moved to Support; Search
  // graduated to `/search`. Dashboard dissolved (D5): the `?mode=` DOMAIN picks
  // the owning domain page, and every board URL still resolves — only the nav
  // identity moved.
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
  // Review split (D10): packing QA is Operations › Packing Review; pairing /
  // catalog-link are Catalog. Every `/review` URL still resolves — the page never moved.
  const reviewPage = (search = '') =>
    getSidebarNavPageId('/review', new URLSearchParams(search));
  assert.equal(reviewPage(), 'operations');
  assert.equal(reviewPage('rtab=flagged'), 'operations');
  assert.equal(reviewPage('mode=pairing'), 'products');
  assert.equal(reviewPage('mode=catalog-link'), 'products');
  assert.equal(getSidebarPageNav('review'), undefined, 'no review L1 — lives under Operations');
  assert.equal(resolveSidebarChild('outbound', at('/review')), null);
  assert.equal(resolveSidebarChild('operations', at('/review')), 'packing-review');
  assert.equal(resolveSidebarChild('products', at('/review', 'mode=pairing')), 'pairing');
  assert.equal(resolveSidebarChild('products', at('/review', 'mode=catalog-link')), 'catalog-link');
  // The route key is untouched, so the Review surface still mounts its own panel.
  assert.equal(getSidebarRouteKey('/review'), 'review');
  // The desk's tab band, in order. Labels left on 2026-08-30 and Shipped
  // arrived the same day — this list IS the band, so the assertion is what
  // keeps a tab from appearing without a decision behind it. Platforms
  // (Amazon DTC, eBay, Shopify) belong in the FACETS of To ship and Shipped,
  // never here.
  //
  // **Shortage joined 2026-09-01** as the need-to-buy peer (OOS / backorder),
  // same orders DataTable family, locked predicate — not extra columns on
  // To-ship and not catalog pairing (Exceptions).
  //
  // **Exceptions joined 2026-08-31**, and it passes the same test FBA passes:
  // a process fork whose queue semantics To ship cannot express. Caged and
  // unpaired orders are excluded from that queue by an explicit predicate
  // (`/api/orders` fulfillmentScope), and the work on them — pair a SKU, fix
  // an item number — is not the work To ship does. It is NOT a facet, because
  // a facet narrows a queue and these rows are not in the queue at all.
  assert.deepEqual(
    getSidebarPageNav('outbound')?.children?.map((c) => c.id),
    ['orders', 'shortage', 'fba', 'shipped', 'exceptions'],
  );
  assert.ok(
    getSidebarPageNav('operations')?.children?.some((c) => c.id === 'packing-review'),
  );

  // Every non-scan desk that wears the page chrome (2026-08-31 port). The
  // predicate needs >1 child, so a desk that loses its second tab silently
  // stops drawing the band — this asserts the opt-in, not the flag.
  for (const pageId of [
    'home',
    'outbound',
    'products',
    'inventory',
    'sourcing',
    'operations',
    'sales',
    'support',
  ]) {
    assert.equal(
      hasDeskPageChrome(getSidebarPageNav(pageId)),
      true,
      `${pageId} wears DeskPageChrome`,
    );
  }
  // Scan stations wear the FRAME (operator 2026-08-31) but must not opt in
  // HERE: their tabs are body-switchers (`?testTab=`, `?triview=`), not nav
  // children, so they pass tabs explicitly to `DeskPageLayout` and the spine
  // keeps whatever rows it has. A `true` in this loop would mean someone made a
  // bench's modes into spine drill-downs, which they are not.
  for (const pageId of ['scan-out', 'packer', 'tech', 'receive', 'triage']) {
    assert.equal(
      hasDeskPageChrome(getSidebarPageNav(pageId)),
      false,
      `${pageId} draws its modes as explicit tabs, not nav children`,
    );
  }
  assert.equal(resolveSidebarChild('outbound', at('/dashboard')), 'orders');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/orders')), 'orders');
  // Shipped lights its own tab. Without its clause the catch-all `return
  // 'orders'` would light To ship on the history desk — a tab claiming to be
  // somewhere the operator is not.
  assert.equal(resolveSidebarChild('outbound', at('/shipping/shipped')), 'shipped');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/fba')), 'fba');
  // Exceptions needs its own clause for the same reason Shipped does: it is a
  // path, and without it the catch-all would light To ship on the workbench.
  assert.equal(resolveSidebarChild('outbound', at('/shipping/exceptions')), 'exceptions');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/shortage')), 'shortage');
  // Support alias is unaffected: `?context=support` is a ticket surface on the
  // orders desk and neither tab may claim it.
  assert.equal(
    resolveSidebarChild('outbound', at('/shipping/orders', 'context=support')),
    null,
  );
  // Inbound is a leaf desk — no L2 children; dashboard inbound bookmarks still
  // resolve the page id to `incoming` until the proxy redirects them.
  assert.equal(resolveSidebarChild('incoming', at('/dashboard', 'mode=inbound')), null);
  assert.equal(resolveSidebarChild('incoming', at('/incoming')), null);
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=sales')), 'sales');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=pickup')), 'pickup');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=repairs')), 'repairs');
  assert.equal(getSidebarNavPageId('/counter'), 'sales');
  assert.equal(resolveSidebarChild('sales', at('/counter')), 'counter');
  assert.equal(resolveSidebarChild('support', at('/support', 'mode=warranty')), 'warranty');
  // To ship was REMOVED from Support (operator ruling 2026-08-31). It was the
  // one tab that left the route — an alias onto `/shipping/orders?context=support`
  // that made two desks disagree about whose page you were on. Legacy
  // `?mode=orders` deep links now land on Tickets rather than a tab that is
  // gone, and Support no longer claims the Shipping URL.
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
  // Tech: top-mode switch only — view=testing flips to Quality Control (id `testing`), else Ready to Pack.
  // The surface graduated /tech → /test (operator-surfaces Phase 8); the mode is
  // param-based so it resolves identically on the canonical route + legacy alias.
  // Legacy view=testing-history still resolves to QC (history browse is inline).
  assert.equal(resolveSidebarChild('tech', at('/test', 'view=testing')), 'testing');
  assert.equal(resolveSidebarChild('tech', at('/test', 'staffId=7')), 'shipping');
  assert.equal(resolveSidebarChild('tech', at('/tech', 'view=testing')), 'testing');
  assert.equal(getSidebarNavPageId('/test', new URLSearchParams('view=testing')), 'testing');
  assert.equal(getSidebarNavPageId('/test', new URLSearchParams('view=testing-history')), 'testing');
  assert.equal(getSidebarNavPageId('/test'), 'ready-to-pack');
  assert.equal(getSidebarNavPageId('/tech', new URLSearchParams('view=testing')), 'testing');
  assert.equal(getSidebarNavPageId('/tech'), 'ready-to-pack');
});

// The Test surface + its legacy alias both resolve to the `tech` nav key so the
// sidebar item stays active across the migration.
test('getSidebarRouteKey maps the Test surface + legacy alias to tech', () => {
  assert.equal(getSidebarRouteKey('/test'), 'tech');
  assert.equal(getSidebarRouteKey('/test/'), 'tech');
  assert.equal(getSidebarRouteKey('/tech'), 'tech');
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

test('/search declares its own route key and is rail-less', () => {
  assert.equal(getSidebarRouteKey('/search'), 'search');
  assert.equal(getSidebarRouteKey('/search/anything'), 'search');
  // Rail-less again as of 2026-08-30 (Pattern E). The column held recent finds;
  // ⌘K's own Recent group is that list, one chord away on every route, so the
  // key would now reserve 360px for a duplicate.
  assert.equal(hasSidebarContextPanel('/search'), false);
  // Spine top pin so MasterNav selects Search instead of falling through to Dashboard.
  const searchNav = APP_SIDEBAR_NAV.find((item) => item.id === 'search');
  assert.ok(searchNav, 'search must be in APP_SIDEBAR_NAV');
  assert.equal(searchNav!.href, '/search');
  assert.equal(searchNav!.kind, 'top');
  // The fallback still exists and still means "nothing claims this path".
  assert.equal(getSidebarRouteKey('/no-such-route'), 'unknown');
});

test('Scan Out is rail-less — the station owns the full left-to-right surface', () => {
  assert.equal(isRaillessSurface('/shipping/scan-out'), true);
  assert.equal(hasSidebarContextPanel('/shipping/scan-out'), false);
});

test('Settings and Admin are rail-less — house encyclopedias collapsed (Phase A)', () => {
  assert.equal(getSidebarRouteKey('/settings'), 'settings');
  assert.equal(getSidebarRouteKey('/settings/roles'), 'settings');
  assert.equal(hasSidebarContextPanel('/settings'), false);
  assert.equal(hasSidebarContextPanel('/settings/integrations'), false);
  assert.equal(getSidebarRouteKey('/admin'), 'admin');
  assert.equal(getSidebarRouteKey('/admin/inventory'), 'admin');
  assert.equal(hasSidebarContextPanel('/admin'), false);
  assert.equal(hasSidebarContextPanel('/admin/inventory'), false);
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

test('stationSubgroupMembers still groups receiving / walk-in / testing peers', () => {
  assert.deepEqual(
    stationSubgroupMembers('receiving').map((p) => p.id),
    ['triage', 'receive'],
  );
  assert.deepEqual(
    stationSubgroupMembers('walk-in').map((p) => p.id),
    ['pickup', 'repair'],
  );
  assert.equal(getSidebarPageNav('repair')?.label, 'Repair Service');
});

test('floorStationPages is the flat Scan Stations map for the header switcher', () => {
  assert.deepEqual(
    floorStationPages().map((p) => [p.id, p.label]),
    [
      ['triage', 'Arrival'],
      ['receive', 'Unbox'],
      ['pickup', 'Local Pickup'],
      ['repair', 'Repair Service'],
      ['testing', 'Quality Control'],
      ['ready-to-pack', 'Picker'],
      ['packer', 'Packing'],
      ['scan-out', 'Scan out'],
    ],
  );
});

test('Testing L1 benches are Quality Control and Ready to Pack', () => {
  assert.deepEqual(
    stationSubgroupMembers('testing').map((p) => [p.id, p.label]),
    [
      ['testing', 'Quality Control'],
      ['ready-to-pack', 'Picker'],
    ],
  );
  const tech = getSidebarPageNav('tech');
  assert.ok(tech?.children);
  assert.deepEqual(
    tech.children.map((child) => [child.id, child.label]),
    [
      ['testing', 'Quality Control'],
      ['shipping', 'Picker'],
    ],
  );
});

test('Picker navigation enters its visible Urgent tab', () => {
  assert.equal(getSidebarPageNav('ready-to-pack')?.href, '/test?ship=urgent');
  const tech = getSidebarPageNav('tech');
  assert.ok(tech?.children);
  assert.deepEqual(tech.children.find((child) => child.id === 'shipping')?.to(), {
    pathname: '/test',
    params: { view: null, ship: 'urgent' },
  });
  assert.equal(
    APP_SIDEBAR_NAV.find((item) => item.id === 'ready-to-pack')?.href,
    '/test?ship=urgent',
  );
});

test('masterNavLabelForPath uses APP_SIDEBAR_NAV L1, never desk tabs or SIDEBAR_TITLES', () => {
  assert.equal(masterNavLabelForPath('/shipping/orders'), 'Shipping');
  assert.equal(masterNavLabelForPath('/shipping/shipped'), 'Shipping');
  assert.equal(masterNavLabelForPath('/shipping/scan-out'), 'Scan out');
  assert.equal(masterNavLabelForPath('/ops/photos'), 'Media Library');
  assert.equal(
    masterNavLabelForPath('/test', new URLSearchParams('view=testing')),
    'Quality Control',
  );
  assert.equal(masterNavLabelForPath('/test'), 'Picker');
  assert.equal(masterNavLabelForPath('/unbox'), 'Unbox');
  assert.equal(masterNavLabelForPath('/incoming'), 'Inbound');
  assert.equal(getMasterNavItem('outbound')?.label, 'Shipping');
  assert.equal(getMasterNavItem('scan-out')?.label, 'Scan out');
  assert.equal(getMasterNavItem('ops-photos')?.label, 'Media Library');
});
