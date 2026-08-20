import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SIDEBAR_NAV,
  getSidebarNavItems,
  isSidebarRouteMobileRestricted,
  isSidebarNavActive,
  isSidebarTopPinActive,
  isSpineBandTopPin,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  getSidebarHref,
  getSidebarRouteKey,
  getSidebarNavPageId,
  hasSidebarContextPanel,
  applyChildTarget,
  resolveSidebarChild,
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
  assert.deepEqual(topIds, ['home', 'search', 'ops-photos', 'plans-live', 'ai-chat']);

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
    'operations belongs to the Monitor drill',
  );

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

test('Plans and Chat stay in the registry but stay off the spine band', () => {
  const items = getSidebarNavItems();
  const bandIds = items.filter(isSpineBandTopPin).map((item) => item.id);
  assert.deepEqual(bandIds, ['home', 'search', 'ops-photos']);

  const plans = items.find((item) => item.id === 'plans-live');
  const chat = items.find((item) => item.id === 'ai-chat');
  assert.ok(plans && chat);
  assert.equal(plans.spineBand, false);
  assert.equal(chat.spineBand, false);
  assert.equal(isSpineBandTopPin(plans), false);
  assert.equal(isSpineBandTopPin(chat), false);
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
  // Dogfood parking is retired: Sourcing ships; Plans / Chat stay in the
  // registry (`kind: 'top'`) with spineBand false.
  // `fba` stays off the spine because /fba is a permanent redirect into Shipping,
  // which already owns that surface (no second front door).
  assert.equal(navIds.has('sourcing'), true, 'sourcing ships in Overview');
  assert.equal(navIds.has('plans-live'), true, 'plans-live stays in the nav registry');
  assert.equal(navIds.has('ai-chat'), true, 'ai-chat stays in the nav registry');
  assert.equal(navIds.has('fba'), false, 'fba redirects into Shipping — no spine row');
  // Studio was promoted out of the parked set — it is a live page, footer-pinned
  // above Admin since 2026-08-02, so it must be present on prod nav.
  assert.equal(navIds.has('studio'), true, 'studio ships as a live nav page');
  // Home is top-pinned; Operations stays an Overview page.
  assert.equal(navIds.has('home'), true, 'home ships as a top-pinned page');
  assert.equal(navIds.has('operations'), true, 'operations ships as a live Overview page');
  // Its Catalog sub-route rides along as an L2 MODE, not a second flat row — a
  // pinned footer row never draws children, so two rows there would have put
  // `/studio/catalog` in the footer beside its own parent.
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
    'tech',
    'packer',
    'products',
    'inventory',
  ]) {
    assert.equal(navIds.has(id), true, `${id} should stay on dogfood nav`);
  }
  assert.equal(navIds.has('warehouse'), false, 'Locations folded under Inventory L2');
  assert.equal(navIds.has('receiving'), false, 'parent Receiving L1 is gone — modes are L1');
  // Dashboard + the print hub dissolved into domain homes (D2 / D5): the routes
  // still resolve, the L1 rows do not exist.
  for (const id of ['dashboard', 'print-labels', 'print-documents']) {
    assert.equal(navIds.has(id), false, `${id} must not own a spine row`);
  }
  assert.equal(navIds.has('sales'), true, 'Sales is its own root section (D4)');
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
  // Sales Board + Local Pickup History + Repairs (Orders moved to
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
// which keeps its mode registry so legacy `?mode=` deep links still resolve)
// and the legacy `receiving` family entry (modes only). Modeful pages carry a
// resolver. Dogfood parking is retired — every other page ships on the spine.
const URL_ONLY_PAGE_IDS = new Set(['fba', 'receiving']);

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
  // Desk Shipping children: Labels / FBA. Ready is an FBA stage tab. Scan out is its own floor L1.
  assert.equal(resolveSidebarChild('outbound', at('/shipping')), 'labels');
  assert.equal(resolveSidebarChild('outbound', at('/shipping', 'mode=ready')), 'fba');
  assert.equal(resolveSidebarChild('outbound', at('/shipping', 'mode=fba')), 'fba');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/labels')), 'labels');
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
  // Review split (D10): packing QA is Fulfillment, pairing / catalog-link are
  // Catalog. Every `/review` URL still resolves — the page never moved.
  const reviewPage = (search = '') =>
    getSidebarNavPageId('/review', new URLSearchParams(search));
  assert.equal(reviewPage(), 'outbound');
  assert.equal(reviewPage('rtab=flagged'), 'outbound');
  assert.equal(reviewPage('mode=pairing'), 'products');
  assert.equal(reviewPage('mode=catalog-link'), 'products');
  assert.equal(getSidebarPageNav('review'), undefined, 'no review L1 page nav');
  assert.equal(resolveSidebarChild('outbound', at('/review')), 'review');
  assert.equal(resolveSidebarChild('products', at('/review', 'mode=pairing')), 'pairing');
  assert.equal(resolveSidebarChild('products', at('/review', 'mode=catalog-link')), 'catalog-link');
  // The route key is untouched, so the Review surface still mounts its own panel.
  assert.equal(getSidebarRouteKey('/review'), 'review');
  assert.equal(resolveSidebarChild('outbound', at('/dashboard')), 'orders');
  assert.equal(resolveSidebarChild('outbound', at('/shipping/orders')), 'orders');
  // Inbound is a leaf desk — no L2 children; dashboard inbound bookmarks still
  // resolve the page id to `incoming` until the proxy redirects them.
  assert.equal(resolveSidebarChild('incoming', at('/dashboard', 'mode=inbound')), null);
  assert.equal(resolveSidebarChild('incoming', at('/incoming')), null);
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=sales')), 'sales');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=pickup')), 'pickup');
  assert.equal(resolveSidebarChild('sales', at('/dashboard', 'mode=repairs')), 'repairs');
  assert.equal(resolveSidebarChild('support', at('/support', 'mode=warranty')), 'warranty');
  assert.equal(resolveSidebarChild('support', at('/support', 'mode=orders')), 'orders');
  // Support › Inquiries aliases the To-ship desk — Support owns the pin.
  assert.equal(
    resolveSidebarChild('support', at('/shipping/orders', 'context=support')),
    'orders',
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

test('/search declares its own route key and does not reserve a context column', () => {
  assert.equal(getSidebarRouteKey('/search'), 'search');
  assert.equal(getSidebarRouteKey('/search/anything'), 'search');
  assert.equal(hasSidebarContextPanel('/search'), false);
  // Spine top pin so MasterNav selects Search instead of falling through to Dashboard.
  const searchNav = APP_SIDEBAR_NAV.find((item) => item.id === 'search');
  assert.ok(searchNav, 'search must be in APP_SIDEBAR_NAV');
  assert.equal(searchNav!.href, '/search');
  assert.equal(searchNav!.kind, 'top');
  // The fallback still exists and still means "nothing claims this path".
  assert.equal(getSidebarRouteKey('/no-such-route'), 'unknown');
});

test('isSidebarNavActive is pathname-only (query strings do not change the match)', () => {
  assert.equal(isSidebarNavActive('/', '/'), true);
  assert.equal(isSidebarNavActive('/search', '/search'), true);
  assert.equal(isSidebarNavActive('/search/extra', '/search'), true);
  assert.equal(isSidebarNavActive('/ops/photos', '/ops/photos'), true);
  assert.equal(isSidebarNavActive('/ai-chat', '/ai-chat'), true);
  assert.equal(isSidebarNavActive('/dashboard', '/ai-chat'), false);

  // Query on href is stripped — pathname matching stays path-only.
  assert.equal(isSidebarNavActive('/', '/?mode=forge&view=live'), true);
  assert.equal(isSidebarNavActive('/search', '/?mode=forge&view=live'), false);

  // Pack / Test / Shipping aliases normalize.
  assert.equal(isSidebarNavActive('/pack', '/pack'), true);
  assert.equal(isSidebarNavActive('/packer', '/pack'), true);
  assert.equal(isSidebarNavActive('/test', '/test'), true);
  assert.equal(isSidebarNavActive('/tech', '/test'), true);
  assert.equal(isSidebarNavActive('/shipping/labels', '/shipping'), true);
  assert.equal(isSidebarNavActive('/outbound', '/shipping'), true);

  assert.equal(isSidebarNavActive(null, '/'), false);
});

test('isSidebarTopPinActive: forge lights Plans, not Home', () => {
  const home = { id: 'home', href: '/' };
  const plans = { id: 'plans-live', href: '/?mode=forge&view=live' };
  const forge = new URLSearchParams('mode=forge&view=live');
  const today = new URLSearchParams();
  const inbox = new URLSearchParams('mode=inbox');

  assert.equal(isSidebarTopPinActive(plans, { pathname: '/', searchParams: forge }), true);
  assert.equal(isSidebarTopPinActive(home, { pathname: '/', searchParams: forge }), false);

  assert.equal(isSidebarTopPinActive(home, { pathname: '/', searchParams: today }), true);
  assert.equal(isSidebarTopPinActive(plans, { pathname: '/', searchParams: today }), false);

  assert.equal(isSidebarTopPinActive(home, { pathname: '/', searchParams: inbox }), true);
  assert.equal(isSidebarTopPinActive(plans, { pathname: '/', searchParams: inbox }), false);

  // Off Home, neither pin is current.
  assert.equal(isSidebarTopPinActive(home, { pathname: '/search', searchParams: today }), false);
  assert.equal(isSidebarTopPinActive(plans, { pathname: '/search', searchParams: forge }), false);
});
