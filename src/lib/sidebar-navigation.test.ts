import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SIDEBAR_NAV,
  PARKED_SIDEBAR_NAV_IDS,
  getSidebarNavItems,
  isSidebarRouteMobileRestricted,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  getSidebarHref,
  getSidebarRouteKey,
  applyModeTarget,
  resolveSidebarMode,
} from '@/lib/sidebar-navigation';

test('getSidebarNavItems returns the full sidebar list by default (parked sub-routes filtered)', () => {
  // A row that rides a parked surface (`parkedSurface`, e.g. studio-catalog on
  // the parked `studio` surface) is dropped while that surface is locked, so a
  // sub-route link never dead-ends on the ParkedSurface stand-in. Force the
  // locked default regardless of the ambient env, then everything else returns
  // verbatim.
  const prevA = process.env.DOGFOOD_FULL_SURFACE;
  const prevB = process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
  delete process.env.DOGFOOD_FULL_SURFACE;
  delete process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
  try {
    const expected = APP_SIDEBAR_NAV.filter((item) => !item.parkedSurface);
    assert.deepEqual(getSidebarNavItems(), expected);
  } finally {
    if (prevA === undefined) delete process.env.DOGFOOD_FULL_SURFACE;
    else process.env.DOGFOOD_FULL_SURFACE = prevA;
    if (prevB === undefined) delete process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
    else process.env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE = prevB;
  }
});

test('a parked sub-route row (studio-catalog) reappears once its surface is unlocked', () => {
  const prev = process.env.DOGFOOD_FULL_SURFACE;
  process.env.DOGFOOD_FULL_SURFACE = '1';
  try {
    const ids = getSidebarNavItems().map((item) => item.id);
    assert.equal(ids.includes('studio-catalog'), true);
  } finally {
    if (prev === undefined) delete process.env.DOGFOOD_FULL_SURFACE;
    else process.env.DOGFOOD_FULL_SURFACE = prev;
  }
});

test('getSidebarNavItems omits mobile-restricted routes in mobile mode', () => {
  const navIds = getSidebarNavItems({ mobileRestricted: true }).map((item) => item.id);

  assert.equal(navIds.includes('operations'), false);
  assert.equal(navIds.includes('support'), false);
  assert.equal(navIds.includes('admin'), false);
  assert.equal(navIds.includes('dashboard'), true);
  // FBA / inventory / studio / etc. are parked off prod nav (dogfood surface).
  assert.equal(navIds.includes('fba'), false);
  // /repair is a Receiving mode route now; the front-desk history page (Sales)
  // keeps the 'walk-in' nav id.
  assert.equal(navIds.includes('walk-in'), true);
});

test('dogfood prod nav omits parked surfaces', () => {
  const navIds = new Set(getSidebarNavItems().map((item) => item.id));
  for (const id of [
    'home',
    'sourcing',
    'inventory',
    'warehouse',
    'fba',
    'studio',
    'ai-chat',
  ]) {
    assert.equal(navIds.has(id), false, `${id} should be parked off APP_SIDEBAR_NAV`);
  }
  // Stations + shipping stay visible.
  for (const id of ['dashboard', 'receiving', 'outbound', 'tech', 'packer']) {
    assert.equal(navIds.has(id), true, `${id} should stay on dogfood nav`);
  }
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
    assert.ok(page.modes && page.modes.length > 0, `${page.id} should declare modes`);
    for (const mode of page.modes!) {
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

// Round-trip must also hold when unrelated query params are already present —
// `applyModeTarget` preserves them, and the resolver must ignore them.
test('mode round-trip preserves unrelated params and still resolves', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    for (const mode of page.modes!) {
      const target = mode.to();
      // A mode legitimately sets/clears its OWN params (e.g. sourcing's lookup
      // clears `q`/`status`). `applyModeTarget` only preserves params the mode's
      // delta doesn't touch — so assert preservation for those keys only.
      const delta = target.params ?? {};
      const seed = new URLSearchParams('openOrderId=42&q=widget');
      const { pathname, search } = applyModeTarget({ pathname: page.href, params: seed }, target);
      const params = new URLSearchParams(search);
      if (!('openOrderId' in delta)) assert.equal(params.get('openOrderId'), '42', `${page.id} dropped openOrderId`);
      if (!('q' in delta)) assert.equal(params.get('q'), 'widget', `${page.id} dropped q`);
      assert.equal(resolveSidebarMode(page.id, { pathname, params }), mode.id);
    }
  }
});

// Dashboard L2 modes wipe Search-scoped selection so Receiving/Shipping never
// inherit openOrderId/map/q from a prior Search handoff (and Search rail opens clean).
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
// deep-link spot-check below.
test("a page's bare href resolves to a declared mode (its default)", () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    const resolved = resolveSidebarMode(page.id, {
      pathname: page.href,
      params: new URLSearchParams(),
    });
    const ids = page.modes!.map((m) => m.id);
    assert.ok(resolved && ids.includes(resolved), `${page.id} bare href resolved to "${resolved}", not a declared mode`);
  }
});

// Mode ids must be unique within a page (the dropdown + L2 rail key on them).
test('mode ids are unique within each page', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    const ids = page.modes!.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `${page.id} has duplicate mode ids`);
  }
});

// Every modeful page id must be a real nav route OR a parked deep-link page,
// and carry a resolver. Parked pages keep SIDEBAR_PAGE_NAV so /fba?mode=… etc.
// still resolve when opened by URL / topic-worktree previews.
test('SIDEBAR_PAGE_NAV pages are prod-nav or parked routes with resolvers', () => {
  const navIds = new Set(APP_SIDEBAR_NAV.map((item) => item.id));
  for (const page of SIDEBAR_PAGE_NAV) {
    assert.ok(
      navIds.has(page.id) || PARKED_SIDEBAR_NAV_IDS.has(page.id as never),
      `${page.id} is not in APP_SIDEBAR_NAV and not in PARKED_SIDEBAR_NAV_IDS`,
    );
    assert.equal(typeof page.resolveMode, 'function', `${page.id} missing resolveMode`);
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

// Packing is modeful: bare /pack is Standard; ?packMode= drives Fragile/Multi.
// The surface graduated /packer → /pack (operator-surfaces Phase 7); the mode is
// param-based so it resolves identically on either route.
test('resolveSidebarMode reads the packer pack-mode', () => {
  const at = (search = '') => ({ pathname: '/pack', params: new URLSearchParams(search) });
  assert.equal(resolveSidebarMode('packer', at()), 'standard');
  assert.equal(resolveSidebarMode('packer', at('packMode=fragile')), 'fragile');
  assert.equal(resolveSidebarMode('packer', at('packMode=multi')), 'multi');
  assert.equal(resolveSidebarMode('packer', at('packMode=bogus')), 'standard');
  // Legacy route still resolves the same mode (proxy redirects it to /pack).
  assert.equal(
    resolveSidebarMode('packer', { pathname: '/packer', params: new URLSearchParams() }),
    'standard',
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
  // FBA sub-modes live under Shipping as fbaMode (legacy mode=plan still works).
  assert.equal(resolveSidebarMode('fba', at('/shipping', 'mode=fba')), 'combine');
  assert.equal(resolveSidebarMode('fba', at('/shipping', 'mode=fba&fbaMode=plan')), 'plan');
  assert.equal(resolveSidebarMode('fba', at('/fba', 'mode=plan')), 'plan');
  // Shipping modes include ready + fba (canonical `/shipping`; `/outbound` redirects).
  assert.equal(resolveSidebarMode('outbound', at('/shipping')), 'labels');
  assert.equal(resolveSidebarMode('outbound', at('/shipping', 'mode=ready')), 'ready');
  assert.equal(resolveSidebarMode('outbound', at('/shipping', 'mode=fba')), 'fba');
  assert.equal(resolveSidebarMode('outbound', at('/shipping', 'mode=scan-out')), 'scan-out');
  // Redirect-window: legacy path still resolves nav key until the edge 308 lands.
  assert.equal(resolveSidebarMode('outbound', at('/outbound', 'mode=ready')), 'ready');
  assert.equal(getSidebarRouteKey('/shipping'), 'outbound');
  assert.equal(getSidebarRouteKey('/outbound'), 'outbound');
  // Dashboard: three L2 modes on `?mode=`. Shipping (id `outbound`) is the
  // default — both `?shipped` and `?unshipped` (+ legacy `?pending` + bare)
  // resolve to it. Receiving rides `?mode=inbound` (canonical) or the
  // `?mode=receiving` alias; Search rides `?mode=search`.
  // Warranty Logger moved to Support (`?mode=warranty`).
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'shipped=')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'pending=')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'warranty=')), 'outbound');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=search')), 'search');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=inbound')), 'receiving');
  assert.equal(resolveSidebarMode('dashboard', at('/dashboard', 'mode=receiving')), 'receiving');
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
  // Sales (former Walk-In main) — 3-mode hub (Local Pickup · Sales · Repair);
  // bare = Sales default, `?mode=` drives it, legacy `?category=` still maps.
  assert.equal(resolveSidebarMode('walk-in', at('/walk-in')), 'sales');
  assert.equal(resolveSidebarMode('walk-in', at('/walk-in', 'mode=pickup')), 'pickup');
  assert.equal(resolveSidebarMode('walk-in', at('/walk-in', 'mode=repair')), 'repair');
  assert.equal(resolveSidebarMode('walk-in', at('/walk-in', 'category=pickups')), 'pickup');
  assert.equal(resolveSidebarMode('walk-in', at('/walk-in', 'category=sales')), 'sales');
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
