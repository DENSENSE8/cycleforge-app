import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SIDEBAR_NAV,
  getSidebarNavItems,
  isSidebarRouteMobileRestricted,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  getSidebarHref,
  getSidebarRouteKey,
  getSidebarNavPageId,
  hasSidebarContextPanel,
  applyModeTarget,
  resolveSidebarMode,
} from '@/lib/sidebar-navigation';
import { routeParamsFor } from '@/lib/routing/registry';

test('getSidebarNavItems returns the full sidebar list by default', () => {
  // Dogfood parking is retired, so no rows are filtered out any more: the
  // default call returns APP_SIDEBAR_NAV verbatim.
  assert.deepEqual(getSidebarNavItems(), APP_SIDEBAR_NAV);
});

test('Home is top-pinned; Sourcing / Operations ship in Overview; AI Chat under Media', () => {
  // All four were unparked (the same promotion Studio took into Library).
  // Re-parking any of them, or moving Home off the top pin, breaks this.
  const items = getSidebarNavItems();

  const home = items.find((item) => item.id === 'home');
  assert.ok(home, 'home should ship on prod nav');
  assert.equal(home.kind, 'top', 'home is top-pinned above Search');

  const aiChat = items.find((item) => item.id === 'ai-chat');
  assert.ok(aiChat, 'ai-chat should ship on prod nav');
  assert.equal(aiChat.kind, 'top', 'ai-chat is top-pinned under Media');

  for (const id of ['operations', 'sourcing']) {
    const row = items.find((item) => item.id === id);
    assert.ok(row, `${id} should ship on prod nav`);
    assert.equal(
      row.kind === 'main' ? row.mainGroup : null,
      'overview',
      `${id} belongs to the Overview drill`,
    );
  }
});

test('getSidebarNavItems omits mobile-restricted routes in mobile mode', () => {
  const navIds = getSidebarNavItems({ mobileRestricted: true }).map((item) => item.id);

  assert.equal(navIds.includes('operations'), false);
  assert.equal(navIds.includes('support'), false);
  assert.equal(navIds.includes('admin'), false);
  assert.equal(navIds.includes('dashboard'), true);
  // /fba is a permanent redirect into Shipping — it owns no spine row.
  assert.equal(navIds.includes('fba'), false);
  // Sales history folded into Dashboard L2 — no separate L1 nav row.
  assert.equal(navIds.includes('walk-in'), false);
});

test('prod nav ships every unparked page; only redirect surfaces stay off', () => {
  const navIds = new Set(getSidebarNavItems().map((item) => item.id));
  // Dogfood parking is retired: Sourcing ships in Overview; AI Chat is top-pinned
  // under Media. `fba` stays off the spine because /fba is a permanent redirect
  // into Shipping, which already owns that surface (no second front door).
  assert.equal(navIds.has('sourcing'), true, 'sourcing ships in Overview');
  assert.equal(navIds.has('ai-chat'), true, 'ai-chat ships top-pinned under Media');
  assert.equal(navIds.has('fba'), false, 'fba redirects into Shipping — no spine row');
  // Studio was promoted out of the parked set — it is a live Library page now,
  // so it must be present on prod nav rather than absent.
  assert.equal(navIds.has('studio'), true, 'studio ships as a live nav page');
  // Home is top-pinned; Operations stays an Overview page.
  assert.equal(navIds.has('home'), true, 'home ships as a top-pinned page');
  assert.equal(navIds.has('operations'), true, 'operations ships as a live Overview page');
  assert.equal(navIds.has('studio-catalog'), true, 'its Catalog sub-route rides along');
  // Stations + shipping + inventory + warehouse stay visible (receiving family
  // promoted to L1: Arrival / Unbox / Pickup / Repair + Incoming on Desk).
  for (const id of [
    'dashboard',
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
    'warehouse',
  ]) {
    assert.equal(navIds.has(id), true, `${id} should stay on dogfood nav`);
  }
  assert.equal(navIds.has('receiving'), false, 'parent Receiving L1 is gone — modes are L1');
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
// URL (the READ path, `resolveMode`) must agree for EVERY mode on EVERY page.
// If a page's URL convention drifts on one side only, this fails loudly.
test('every mode round-trips: resolveMode(apply(to(mode))) === mode', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (!page.modes || page.modes.length === 0) continue;
    for (const mode of page.modes) {
      // Start from the page's bare href with no params — the cold-link case.
      const { pathname, search } = applyModeTarget(
        { pathname: page.href, params: new URLSearchParams() },
        mode.to(),
      );
      const resolved = resolveSidebarMode(page.id, {
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
    if (!page.modes || page.modes.length === 0) continue;
    for (const mode of page.modes) {
      const target = mode.to();
      // A mode legitimately sets/clears its OWN params (e.g. Review's Pairing
      // clears `rtab`/`packerLogId`). `applyModeTarget` only preserves params
      // the mode's delta doesn't touch — so assert preservation for those keys
      // only. Such a clear list is load-bearing ONLY while the route has no
      // spec; `route-mode-registry.guard.test.ts` fails the moment one graduates
      // while keeping it.
      const delta = target.params ?? {};
      const seed = new URLSearchParams('openOrderId=42&q=widget');
      const { pathname, search } = applyModeTarget({ pathname: page.href, params: seed }, target);
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

      assert.equal(resolveSidebarMode(page.id, { pathname, params }), mode.id);
    }
  }
});

// A dashboard L2 switch emits only its own delta, so a retired Search handoff
// (`openOrderId`/`map`/`q`) can never ride along into a domain that has no use
// for it — the guarantee that let the hand-written clear lists be deleted.
test('dashboard modes clear Search-scoped openOrderId/map/q', () => {
  const page = SIDEBAR_PAGE_NAV.find((p) => p.id === 'dashboard');
  assert.ok(page?.modes);
  const seed = new URLSearchParams(
    'mode=search&openOrderId=42&map=search&q=05-14897-15602&sort=scanned_newest',
  );
  for (const mode of page!.modes!) {
    const { search } = applyModeTarget({ pathname: '/dashboard', params: seed }, mode.to());
    const params = new URLSearchParams(search);
    assert.equal(params.get('openOrderId'), null, `${mode.id} should clear openOrderId`);
    assert.equal(params.get('map'), null, `${mode.id} should clear map`);
    assert.equal(params.get('q'), null, `${mode.id} should clear q`);
  }
});

// A page's bare href must resolve to one of its declared modes (its default).
// NB: the default isn't always the leftmost mode — FBA lists plan/combine/
// shipped but defaults to `combine`. The specific defaults are pinned in the
// deep-link spot-check below. Modeless L1 pages (receiving family stations)
// resolve to null.
test("a page's bare href resolves to a declared mode (its default)", () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    const resolved = resolveSidebarMode(page.id, {
      pathname: page.href,
      params: new URLSearchParams(),
    });
    if (!page.modes || page.modes.length === 0) {
      assert.equal(resolved, null, `${page.id} is modeless but resolved "${resolved}"`);
      continue;
    }
    const ids = page.modes.map((m) => m.id);
    assert.ok(resolved && ids.includes(resolved), `${page.id} bare href resolved to "${resolved}", not a declared mode`);
  }
});

// Mode ids must be unique within a page (the dropdown + L2 rail key on them).
test('mode ids are unique within each page', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (!page.modes) continue;
    const ids = page.modes.map((m) => m.id);
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
    if (page.modes && page.modes.length > 0) {
      assert.equal(typeof page.resolveMode, 'function', `${page.id} missing resolveMode`);
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

// resolveSidebarMode returns null for single-surface pages (no mode row).
// NB: `support` gained tickets/voicemail/calls modes in SIDEBAR_PAGE_NAV, so it
// is no longer modeless — use `ai-chat`, which lives only in APP_SIDEBAR_NAV.
test('resolveSidebarMode returns null for pages without modes', () => {
  assert.equal(getSidebarPageNav('ai-chat'), undefined);
  assert.equal(resolveSidebarMode('ai-chat', { pathname: '/ai-chat', params: new URLSearchParams() }), null);
  assert.equal(resolveSidebarMode('settings', { pathname: '/settings', params: new URLSearchParams() }), null);
  // Search is modeless (APP_SIDEBAR_NAV only) — no SIDEBAR_PAGE_NAV entry.
  assert.equal(getSidebarPageNav('search'), undefined);
  assert.equal(resolveSidebarMode('search', { pathname: '/search', params: new URLSearchParams() }), null);
});

// Operations is modeful: bare /operations is Live; ?mode= drives the rest.
test('resolveSidebarMode reads the operations mode', () => {
  const at = (search = '') => ({ pathname: '/operations', params: new URLSearchParams(search) });
  assert.equal(resolveSidebarMode('operations', at()), 'live');
  assert.equal(resolveSidebarMode('operations', at('mode=analytics')), 'analytics');
  assert.equal(resolveSidebarMode('operations', at('mode=insights')), 'insights');
  assert.equal(resolveSidebarMode('operations', at('mode=history')), 'history');
  assert.equal(resolveSidebarMode('operations', at('mode=signals')), 'signals');
  // `plans` is no longer an Operations mode (forge/plans moved to Home, HOME-OPS
  // §3.2) — a stale `?mode=plans` link resolves to the Live default here and is
  // redirected to Home by OperationsWorkspace.
  assert.equal(resolveSidebarMode('operations', at('mode=plans')), 'live');
  assert.equal(resolveSidebarMode('operations', at('mode=bogus')), 'live');
});

// Packing is modeless Standard-only in MasterNav. Legacy `?packMode=` may still
// hit the pack surface; resolveSidebarMode returns null without modes.
test('resolveSidebarMode returns null for modeless packer', () => {
  const at = (search = '') => ({ pathname: '/pack', params: new URLSearchParams(search) });
  assert.equal(getSidebarPageNav('packer')?.modes, undefined);
  assert.equal(resolveSidebarMode('packer', at()), null);
  assert.equal(resolveSidebarMode('packer', at('packMode=fragile')), null);
  assert.equal(
    resolveSidebarMode('packer', { pathname: '/packer', params: new URLSearchParams() }),
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
  assert.equal(resolveSidebarMode('receiving', at('/receiving', 'mode=incoming')), 'incoming');
  assert.equal(resolveSidebarMode('receiving', at('/receiving', 'mode=pickup')), 'pickup');
  assert.equal(resolveSidebarMode('receiving', at('/receiving')), 'receive');
  // Unbox + Triage are now their own first-class surface routes — resolved
  // path-based, even with a deep-link param present.
  assert.equal(resolveSidebarMode('receiving', at('/unbox')), 'receive');
  assert.equal(resolveSidebarMode('receiving', at('/unbox', 'recvId=123')), 'receive');
  assert.equal(resolveSidebarMode('receiving', at('/triage')), 'triage');
  assert.equal(resolveSidebarMode('receiving', at('/triage', 'triview=unfound')), 'triage');
  assert.equal(resolveSidebarMode('receiving', at('/incoming')), 'incoming');
  assert.equal(resolveSidebarMode('receiving', at('/incoming', 'state=IN_TRANSIT')), 'incoming');
  // Pickup + History graduated to their own routes (Phase 9) — resolved path-based
  // (`/receiving/history` must beat the `/receiving` params fall-through), while the
  // legacy `?mode=` deep-links still resolve for back-compat.
  // Local Pickup + Repair are receiving modes, each on its own graduated route.
  assert.equal(resolveSidebarMode('receiving', at('/pickup')), 'pickup');
  assert.equal(resolveSidebarMode('receiving', at('/repair')), 'repair');
  assert.equal(resolveSidebarMode('receiving', at('/receiving', 'mode=repair')), 'repair');
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
  assert.equal(resolveSidebarMode('receive', at('/unbox')), null);
  // FBA sub-modes live under Shipping as fbaMode (legacy mode=plan still works).
  assert.equal(resolveSidebarMode('fba', at('/shipping', 'mode=fba')), 'combine');
  assert.equal(resolveSidebarMode('fba', at('/shipping', 'mode=fba&fbaMode=plan')), 'plan');
  assert.equal(resolveSidebarMode('fba', at('/fba', 'mode=plan')), 'plan');
  // Desk Shipping modes: Labels / Ready / FBA. Scan out is its own floor L1.
  assert.equal(resolveSidebarMode('outbound', at('/shipping')), 'labels');
  assert.equal(resolveSidebarMode('outbound', at('/shipping', 'mode=ready')), 'ready');
  assert.equal(resolveSidebarMode('outbound', at('/shipping', 'mode=fba')), 'fba');
  assert.equal(resolveSidebarMode('outbound', at('/shipping/labels')), 'labels');
  assert.equal(resolveSidebarMode('outbound', at('/shipping/ready')), 'ready');
  assert.equal(resolveSidebarMode('outbound', at('/shipping/fba')), 'fba');
  // Redirect-window: legacy path still resolves nav key until the edge 308 lands.
  assert.equal(resolveSidebarMode('outbound', at('/outbound', 'mode=ready')), 'ready');
  assert.equal(getSidebarRouteKey('/shipping'), 'outbound');
  assert.equal(getSidebarRouteKey('/outbound'), 'outbound');
  assert.equal(getSidebarRouteKey('/shipping/scan-out'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/labels'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/ready'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/fba'), 'outbound');
  assert.equal(getSidebarNavPageId('/shipping/scan-out'), 'scan-out');
  assert.equal(resolveSidebarMode('scan-out', at('/shipping/scan-out')), null);
  // Dashboard: Shipping (id `outbound`) is the default — `?shipped`,
  // `?unshipped`, legacy `?pending`, and bare all resolve to it. Receiving
  // rides `?mode=inbound` (canonical) or the `?mode=receiving` alias. Sales /
  // Local Pickup are the front-desk history domain (`?mode=sales|pickup`).
  // Warranty Logger moved to Support; Search graduated to `/search`.
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'shipped=')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'pending=')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'warranty=')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=search')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=inbound')), 'receiving');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=receiving')), 'receiving');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=sales')), 'sales');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=pickup')), 'pickup');
  assert.equal(resolveSidebarMode('support', at('/support', 'mode=warranty')), 'warranty');
  assert.equal(resolveSidebarMode('support', at('/support', 'mode=orders')), 'orders');
  assert.equal(resolveSidebarMode('support', at('/support')), 'tickets');
  // Tech: top-mode switch only — view=testing flips to Testing, else Shipping.
  // The surface graduated /tech → /test (operator-surfaces Phase 8); the mode is
  // param-based so it resolves identically on the canonical route + legacy alias.
  // Legacy view=testing-history still resolves to Testing (history browse is inline).
  assert.equal(resolveSidebarMode('tech', at('/test', 'view=testing')), 'testing');
  assert.equal(resolveSidebarMode('tech', at('/test', 'staffId=7')), 'shipping');
  assert.equal(resolveSidebarMode('tech', at('/tech', 'view=testing')), 'testing');
});

// The Test surface + its legacy alias both resolve to the `tech` nav key so the
// sidebar item stays active across the migration.
test('getSidebarRouteKey maps the Test surface + legacy alias to tech', () => {
  assert.equal(getSidebarRouteKey('/test'), 'tech');
  assert.equal(getSidebarRouteKey('/test/'), 'tech');
  assert.equal(getSidebarRouteKey('/tech'), 'tech');
});

test('getSidebarRouteKey maps the dedicated order workspace to order', () => {
  assert.equal(getSidebarRouteKey('/o/6057'), 'order');
  assert.equal(getSidebarRouteKey('/o/12-34567-89012'), 'order');
  assert.equal(getSidebarRouteKey('/o'), 'order');
});

// `/search` is Workbench master–detail: hit list in the context rail, selected
// entity detail in the main pane (`?q=` + `?sel=`).
test('/search declares its own route key and reserves a context column', () => {
  assert.equal(getSidebarRouteKey('/search'), 'search');
  assert.equal(getSidebarRouteKey('/search/anything'), 'search');
  assert.equal(hasSidebarContextPanel('/search'), true);
  // Spine top pin so MasterNav selects Search instead of falling through to Dashboard.
  const searchNav = APP_SIDEBAR_NAV.find((item) => item.id === 'search');
  assert.ok(searchNav, 'search must be in APP_SIDEBAR_NAV');
  assert.equal(searchNav!.href, '/search');
  assert.equal(searchNav!.kind, 'top');
  // The fallback still exists and still means "nothing claims this path".
  assert.equal(getSidebarRouteKey('/no-such-route'), 'unknown');
});
