/**
 * Behaviour of the isolation waist itself: parse drops what a route did not
 * declare, build never reads the current location, and invalid values die at the
 * boundary instead of reaching a reader that would have to defend itself.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRouteUrl,
  isRouteParamsClean,
  parseRouteParams,
  paramCanonical,
  paramEnum,
  paramPositiveInt,
  paramRoundTrip,
  paramText,
  defineRouteParams,
} from './route-params';
import {
  HISTORY_ROUTE_PARAMS,
  INCOMING_ROUTE_PARAMS,
  TRIAGE_ROUTE_PARAMS,
  UNBOX_ROUTE_PARAMS,
} from './receiving-routes';
import { PRODUCTS_ROUTE_PARAMS } from './query-mode-routes';
import { routeParamsFor } from './registry';
import {
  normalizeUnboxWorkspaceTabParams,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';
import { SUPPORT_MODES } from '@/components/sidebar/support/support-sidebar-shared';

const DEMO = defineRouteParams({
  route: '/demo',
  owns: { tab: paramEnum(['a', 'b'] as const), id: paramPositiveInt },
  carries: ['staff'],
});

test('parseRouteParams keeps owned params and drops undeclared ones', () => {
  const next = parseRouteParams(DEMO, new URLSearchParams('tab=b&id=42&nope=1&view=testing'));
  assert.equal(next.get('tab'), 'b');
  assert.equal(next.get('id'), '42');
  assert.equal(next.get('nope'), null);
  assert.equal(next.get('view'), null);
});

test('parseRouteParams keeps carried ambient params', () => {
  const next = parseRouteParams(DEMO, new URLSearchParams('staff=7&colsort=received_at'));
  assert.equal(next.get('staff'), '7');
  // `colsort` is ambient but this route did not opt in.
  assert.equal(next.get('colsort'), null);
});

test('parseRouteParams drops values that fail their schema', () => {
  const next = parseRouteParams(DEMO, new URLSearchParams('tab=garbage&id=0&staff=-3'));
  assert.equal(next.get('tab'), null);
  assert.equal(next.get('id'), null);
  assert.equal(next.get('staff'), null);
});

test('parseRouteParams normalizes case and whitespace', () => {
  const next = parseRouteParams(DEMO, new URLSearchParams('tab= B '));
  assert.equal(next.get('tab'), 'b');
});

test('buildRouteUrl constructs from declared values only — it never copies', () => {
  assert.equal(buildRouteUrl(DEMO, { tab: 'a', staff: 7 }), '/demo?tab=a&staff=7');
  assert.equal(buildRouteUrl(DEMO), '/demo');
  // Undeclared and invalid values cannot be smuggled in.
  assert.equal(buildRouteUrl(DEMO, { triq: 'x', tab: 'zzz' }), '/demo');
  // Null / undefined / empty omit the key rather than emitting a bare `?k=`.
  assert.equal(buildRouteUrl(DEMO, { tab: null, id: undefined, staff: '' }), '/demo');
});

test('paramRoundTrip accepts only what the house parser returns unchanged', () => {
  const schema = paramRoundTrip((raw) => (raw === 'newest' ? raw : null));
  assert.equal(schema.safeParse('newest').success, true);
  assert.equal(schema.safeParse('oldest').success, false);
});

test('paramCanonical rewrites aliases and rejects unknown tokens', () => {
  const schema = paramCanonical((raw) => (raw === 'racks' ? 'bays' : raw === 'bays' ? 'bays' : null));
  assert.deepEqual(schema.safeParse('racks'), { success: true, data: 'bays' });
  assert.deepEqual(schema.safeParse('bays'), { success: true, data: 'bays' });
  assert.equal(schema.safeParse('shelves').success, false);
});

test('paramText trims and rejects an empty or oversized value', () => {
  assert.deepEqual(paramText.safeParse('  hi  '), { success: true, data: 'hi' });
  assert.equal(paramText.safeParse('   ').success, false);
  assert.equal(paramText.safeParse('x'.repeat(201)).success, false);
});

// ── The reported bug, at the unit level ──────────────────────────────────────

test('a Triage-only param cannot survive a landing on /unbox', () => {
  const leaked = new URLSearchParams('triq=BOX-9&triview=unfound&unboxview=queue');
  const next = parseRouteParams(UNBOX_ROUTE_PARAMS, leaked);
  assert.equal(next.get('triq'), null);
  assert.equal(next.get('triview'), null);
  assert.equal(next.get('unboxview'), 'queue');
});

test('an Incoming filter set cannot survive a landing on /triage', () => {
  const leaked = new URLSearchParams('state=STALLED&po_from=2026-01-01&page=4&sort=zoho_oldest');
  const next = parseRouteParams(TRIAGE_ROUTE_PARAMS, leaked);
  assert.equal(next.toString(), '');
});

test('Incoming desk accepts Pipeline ∪ Docked sorts; History keeps its own vocabulary', () => {
  const incoming = new URLSearchParams('sort=zoho_oldest');
  const history = new URLSearchParams('sort=unboxed_newest');
  assert.equal(parseRouteParams(INCOMING_ROUTE_PARAMS, incoming).get('sort'), 'zoho_oldest');
  assert.equal(parseRouteParams(HISTORY_ROUTE_PARAMS, history).get('sort'), 'unboxed_newest');
  // Incoming desk hygiene keeps Docked ids (lane switch clears via clearCrossLaneParams).
  assert.equal(parseRouteParams(INCOMING_ROUTE_PARAMS, history).get('sort'), 'unboxed_newest');
  // Standalone History still rejects Pipeline ORDER BY ids.
  assert.equal(parseRouteParams(HISTORY_ROUTE_PARAMS, incoming).get('sort'), null);
});

test('Unbox Displays URL keys are stripped by surface hygiene', () => {
  // Displays leaf + nest are local React state (Arrival parity). Stale
  // `?display=` / nest params must not survive hygiene — mount strip + desk
  // claim also clear them, and the registry must not re-own them.
  const dirty = new URLSearchParams(
    'openReceivingId=7&display=photos&photoAction=send&linkageAction=note&ticketAction=claim&unitsAction=prebox&claimMode=link&ticketView=1&claimView=1&inventoryAction=items',
  );
  const next = parseRouteParams(UNBOX_ROUTE_PARAMS, dirty);
  assert.equal(next.get('openReceivingId'), '7');
  for (const key of [
    'display',
    'photoAction',
    'linkageAction',
    'ticketAction',
    'unitsAction',
    'claimMode',
    'ticketView',
    'claimView',
    'inventoryAction',
  ]) {
    assert.equal(next.get(key), null, `?${key}= must be stripped from /unbox hygiene`);
  }
});

test('EVERY Unbox workbench tab wire survives surface hygiene', () => {
  // When History got an explicit wire (`?unboxview=history`, 2026-08-08) the
  // route enum still only listed `recent|queue|viewed`. Hygiene stripped History
  // on the next pass and the strip bounced back to Queue (the bare-/unbox
  // default). Round-trip the SoT writer so a new tab cannot land without
  // surviving hygiene.
  const tabs: UnboxWorkspaceTab[] = ['incoming', 'queue', 'recent', 'history', 'all'];
  for (const tab of tabs) {
    const written = new URLSearchParams();
    normalizeUnboxWorkspaceTabParams(written, tab);
    const wire = written.get('unboxview');
    if (wire == null) {
      // Queue omits the param — nothing for hygiene to keep or drop.
      assert.equal(tab, 'queue');
      continue;
    }
    const next = parseRouteParams(UNBOX_ROUTE_PARAMS, new URLSearchParams(`unboxview=${wire}`));
    assert.equal(
      next.get('unboxview'),
      wire,
      `?unboxview=${wire} (${tab}) must survive /unbox hygiene`,
    );
  }
  // Migrations / legacy tokens kept so old links are not deleted mid-flight.
  assert.equal(
    parseRouteParams(UNBOX_ROUTE_PARAMS, new URLSearchParams('unboxview=urgent')).get('unboxview'),
    'urgent',
  );
  assert.equal(
    parseRouteParams(UNBOX_ROUTE_PARAMS, new URLSearchParams('unboxview=recent')).get('unboxview'),
    'recent',
  );
  assert.equal(
    parseRouteParams(UNBOX_ROUTE_PARAMS, new URLSearchParams('unboxview=nonsense')).get(
      'unboxview',
    ),
    null,
  );
});

test('Support mode=tickets survives the route registry (default deep-link wire)', () => {
  // VoicemailDetail writes `?mode=tickets`; the hand-copied enum omitted the
  // default token. Round-trip SUPPORT_MODES so a deep link is not stripped.
  const spec = routeParamsFor('/support');
  assert.ok(spec);
  for (const mode of SUPPORT_MODES) {
    assert.equal(
      parseRouteParams(spec, new URLSearchParams(`mode=${mode}`)).get('mode'),
      mode,
      `?mode=${mode} must survive /support registry`,
    );
  }
  assert.equal(parseRouteParams(spec, new URLSearchParams('mode=nonsense')).get('mode'), null);
});

test('default-omit mode wires survive hygiene (review/pack/locations/sourcing/home/ops)', () => {
  // Same class as support `tickets`: defaults usually omitted from the URL, but
  // deep links / assistant copy write them. Hand-copied enums that forgot the
  // default token stripped them on the next hygiene pass.
  const cases: Array<{ path: string; key: string; wire: string }> = [
    { path: '/review', key: 'mode', wire: 'packer' },
    { path: '/pack', key: 'packMode', wire: 'standard' },
    { path: '/inventory/locations', key: 'tab', wire: 'labels' },
    { path: '/warehouse', key: 'tab', wire: 'labels' },
    { path: '/sourcing', key: 'mode', wire: 'queue' },
    { path: '/', key: 'mode', wire: 'daily' },
    { path: '/operations', key: 'mode', wire: 'live' },
    { path: '/walk-in', key: 'mode', wire: 'sales' },
    { path: '/dashboard', key: 'mode', wire: 'outbound' },
  ];
  for (const { path, key, wire } of cases) {
    const spec = routeParamsFor(path);
    assert.ok(spec, `${path} must resolve a route spec`);
    assert.equal(
      parseRouteParams(spec!, new URLSearchParams(`${key}=${wire}`)).get(key),
      wire,
      `${path}?${key}=${wire} must survive hygiene`,
    );
  }
});

test('Locations ?tab=racks hygiene rewrites to bays', () => {
  for (const path of ['/inventory/locations', '/warehouse']) {
    const spec = routeParamsFor(path);
    assert.ok(spec, `${path} must resolve a route spec`);
    assert.equal(
      parseRouteParams(spec!, new URLSearchParams('tab=racks')).get('tab'),
      'bays',
      `${path}?tab=racks must canonicalize to bays`,
    );
  }
});

test('special-bin print page keeps barcode + count', () => {
  const spec = routeParamsFor('/inventory/locations/print/special-bin');
  assert.ok(spec);
  assert.equal(spec.route, '/inventory/locations/print/special-bin');
  const kept = parseRouteParams(
    spec,
    new URLSearchParams('barcode=RETURNS-TEST&count=12&tab=bins'),
  );
  assert.equal(kept.get('barcode'), 'RETURNS-TEST');
  assert.equal(kept.get('count'), '12');
  assert.equal(kept.get('tab'), null);
});

test('closed outbound vocabularies survive hygiene (fbaMode / rtab / etype)', () => {
  const fba = routeParamsFor('/shipping/fba');
  assert.ok(fba);
  for (const mode of ['ready', 'plan', 'combine', 'shipped']) {
    assert.equal(
      parseRouteParams(fba!, new URLSearchParams(`fbaMode=${mode}`)).get('fbaMode'),
      mode,
    );
  }
  assert.equal(
    parseRouteParams(fba!, new URLSearchParams('rtab=prebox')).get('rtab'),
    'prebox',
  );
  assert.equal(
    parseRouteParams(fba!, new URLSearchParams('fbaMode=nonsense')).get('fbaMode'),
    null,
  );

  // `/shipping/labels` was DELETED (2026-08-30) — route and spec both. The
  // assertion is kept and inverted rather than removed: the registry must find
  // NO spec for it, which is what proves the spec went with the route instead
  // of lingering as a boundary parse for a page that cannot be reached.
  assert.equal(
    routeParamsFor('/shipping/labels'),
    null,
    'a deleted route owns no params',
  );

  const search = routeParamsFor('/search');
  assert.ok(search);
  assert.equal(
    parseRouteParams(search!, new URLSearchParams('etype=order')).get('etype'),
    'order',
  );
  assert.equal(
    parseRouteParams(search!, new URLSearchParams('etype=nonsense')).get('etype'),
    null,
  );
});

test('Unbox History search triple survives surface hygiene', () => {
  // Drill parent-map footer + List chrome write `?rh_q=` on `/unbox`. Without
  // owning the History search keys, useSurfaceParamHygiene strips them and the
  // TechRailSearchBar draft snaps empty (flash → reset).
  const dirty = new URLSearchParams(
    'hlayout=drill&drillPo=po:1&rh_q=acme&rh_field=po&rh_scope=unmatched',
  );
  const next = parseRouteParams(UNBOX_ROUTE_PARAMS, dirty);
  assert.equal(next.get('rh_q'), 'acme');
  assert.equal(next.get('rh_field'), 'po');
  assert.equal(next.get('rh_scope'), 'unmatched');
  assert.equal(next.get('hlayout'), 'drill');
  assert.equal(next.get('drillPo'), 'po:1');
});

test('a legacy `?mode=` is dropped by every graduated surface', () => {
  for (const spec of [UNBOX_ROUTE_PARAMS, TRIAGE_ROUTE_PARAMS, INCOMING_ROUTE_PARAMS]) {
    const next = parseRouteParams(spec, new URLSearchParams('mode=history'));
    assert.equal(next.get('mode'), null, `${spec.route} must not carry ?mode=`);
  }
});

test('isRouteParamsClean is true only for an already-owned query string', () => {
  assert.equal(isRouteParamsClean(DEMO, new URLSearchParams('tab=a')), true);
  assert.equal(isRouteParamsClean(DEMO, new URLSearchParams('tab=a&nope=1')), false);
});

// ── /products — the surface that never had a denylist to leak past ───────────

test('a /products view switch carries nothing but the staff filter', () => {
  // The operator is in QC with a selection, a filter and a Labels history row.
  // Every one of these used to ride into the next view, because the switch
  // patched `?view=` on a copy of the whole query string.
  const url = buildRouteUrl(PRODUCTS_ROUTE_PARAMS, { view: 'pairing', staff: 7 });
  assert.equal(url, '/products?view=pairing&staff=7');
});

test('/products drops another view\'s state on arrival', () => {
  const leaked = new URLSearchParams(
    'view=qc&skuId=4821&q=laptop&historyId=99&sort=title&labelsView=recent',
  );
  const next = parseRouteParams(PRODUCTS_ROUTE_PARAMS, leaked);
  // Declared, so a pasted deep-link into one view keeps working…
  assert.equal(next.get('view'), 'qc');
  // …while a value that only makes sense elsewhere still dies at the boundary.
  assert.equal(parseRouteParams(PRODUCTS_ROUTE_PARAMS, new URLSearchParams('triq=BOX-9')).toString(), '');
});

test('/products validates each view vocabulary through its own parser', () => {
  const parse = (qs: string) => parseRouteParams(PRODUCTS_ROUTE_PARAMS, new URLSearchParams(qs));
  // Composed from parseProductsView / parseLabelsView, so a value the surface
  // would reject cannot sit in the URL pretending to be real.
  assert.equal(parse('view=qc').get('view'), 'qc');
  assert.equal(parse('view=nope').get('view'), null);
  // Reference + Kit Parts were REMOVED 2026-09-15, and removal means the wire
  // value dies at the boundary too — a stale bookmark folds back to Manuals
  // rather than half-opening a body nobody maintains. This is the line that
  // separates a removed tab from a parked one (`@/lib/nav/parked-tabs`), where
  // the URL keeps working on purpose.
  assert.equal(parse('view=catalog').get('view'), null);
  assert.equal(parse('view=kit').get('view'), null);
  assert.equal(parse('labelsView=recent').get('labelsView'), 'recent');
  assert.equal(parse('labelsView=nope').get('labelsView'), null);
  assert.equal(parse('sort=title').get('sort'), 'title');
  assert.equal(parse('sort=zoho_oldest').get('sort'), null);
  // The Reference chrome's own keys went with it — undeclared is stripped.
  assert.equal(parse('linkFilter=unlinked_pending').get('linkFilter'), null);
  assert.equal(parse('platform=amazon').get('platform'), null);
  assert.equal(parse('pending=1').get('pending'), null);
});

test('a Products selection cannot survive a landing on a receiving surface', () => {
  const leaked = new URLSearchParams('skuId=4821&labelsView=recent&historyId=99');
  assert.equal(parseRouteParams(UNBOX_ROUTE_PARAMS, leaked).toString(), '');
});

// ── /shipping/orders — the lifecycle tabs are BARE presence flags ────────────

test('a bare To-ship lifecycle flag survives the boundary parse', () => {
  const spec = routeParamsFor('/shipping/orders')!;
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();

  // `?shipped` (no `=`) is what the app writes and what `.has()` reads. Under
  // the old `paramText` declaration every one of these parsed to "" and the
  // lifecycle tab silently reverted to Unshipped.
  for (const flag of ['unshipped', 'pending', 'packed', 'tested', 'shipped']) {
    assert.equal(parse(flag), `${flag}=`, `?${flag} must survive as a presence flag`);
  }
  // Every accepted spelling normalizes to the bare form `.has()` tests for.
  assert.equal(parse('shipped=1'), 'shipped=');
  // …but it is still a flag, not free text.
  assert.equal(parse('shipped=garbage'), '');
});

test('/shipping/orders declares the params its own components read', () => {
  const spec = routeParamsFor('/shipping/orders')!;
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).get(qs.split('=')[0]!);

  // `searchScopeHref('ORDER')` hands off to `/shipping/orders?search=`, and
  // the To-ship desk reads it — undeclared, it was dropped on arrival.
  assert.equal(parse('search=widget'), 'widget');
  // OutboundFilterStrip's two facets.
  assert.equal(parse('attention=1'), '1');
  assert.equal(parse('ustatus=TESTED'), 'TESTED');
  assert.equal(parse('context=support'), 'support');
  assert.equal(parse('dateFrom=2026-08-01'), '2026-08-01');
  assert.equal(parse('dateTo=2026-08-27'), '2026-08-27');
  // Packed dismiss writes `allDates=1` so current-week seed does not re-apply.
  assert.equal(parse('allDates=1'), '1');
  // Labels walk. Undeclared, hygiene strips `?paperwork=` and the desk flashes.
  assert.equal(parse('paperwork=42'), '42');
  assert.equal(parse('paperwork=0'), null);
});

test('routeParamsFor resolves the longest route first', () => {
  assert.equal(routeParamsFor('/receiving/history')?.route, '/receiving/history');
  assert.equal(routeParamsFor('/unbox')?.route, '/unbox');
  assert.equal(routeParamsFor('/unbox/anything')?.route, '/unbox');
  // Bare `/receiving` and the unfound sub-tree stay un-owned for now.
  assert.equal(routeParamsFor('/receiving'), null);
  assert.equal(routeParamsFor('/receiving/unfound'), null);
  // `/fba` is the last un-migrated surface — and it is PARKED, so a spec there
  // would be groundwork with no observable behaviour (see the sourcing note in
  // docs/todo/nav-routing-refactor-FINISH-PROMPT.md §3.1).
  assert.equal(routeParamsFor('/fba'), null);
  // `/pack` is the canonical packing route; `/packer` is a legacy alias the proxy
  // normalizes, so it deliberately has no spec of its own.
  assert.equal(routeParamsFor('/pack')?.route, '/pack');
  assert.equal(routeParamsFor('/packer'), null);
  assert.equal(routeParamsFor('/review')?.route, '/review');
  assert.equal(routeParamsFor('/warehouse')?.route, '/warehouse');
  // `/inventory` owns its sub-routes by prefix — they share one param set via
  // `useInventoryUrlState`, so one spec is correct rather than four.
  assert.equal(routeParamsFor('/inventory')?.route, '/inventory');
  assert.equal(routeParamsFor('/inventory/graph')?.route, '/inventory');
  assert.equal(routeParamsFor('/inventory/triage')?.route, '/inventory');
});

test('/sourcing owns the two keys both of its clear lists forgot', () => {
  const spec = routeParamsFor('/sourcing')!;
  assert.equal(spec.route, '/sourcing');
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();

  // `by` (Scout's field toggle) and `range` (the Analytics window) were absent
  // from BOTH the panel's `goMode` deletes and the nav targets' null-maps, so
  // they leaked across every mode switch. Declared, they now survive a paste
  // and are dropped by construction on a switch.
  assert.equal(parse('by=serial'), 'by=serial');
  assert.equal(parse('range=1y'), 'range=1y');
  // Values outside each vocabulary are still refused.
  assert.equal(parse('by=hacked'), '');
  assert.equal(parse('range=7d'), '');
  // Legacy mode aliases survive to `resolveSourcingMode`, which folds them.
  assert.equal(parse('mode=lookup'), 'mode=lookup');
  assert.equal(parse('mode=alerts'), 'mode=alerts');
});

test('/test owns the tab params that are read through a CONSTANT', () => {
  // `ship` / `testTab` are read as `searchParams.get(SHIPPING_WORKSPACE_TAB_PARAM)`
  // from `@/utils/*-workspace-state` — outside any surface tree and not a string
  // literal, so neither the method's grep nor the ownership guard can see them.
  // This test is the standing check that they stayed declared.
  const spec = routeParamsFor('/test')!;
  assert.equal(spec.route, '/test');
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();

  assert.equal(parse('ship=history'), 'ship=history');
  // Legacy ship=fba rejected — FBA owns `/shipping/fba` (IA row L).
  assert.equal(parse('ship=fba'), '');
  assert.equal(parse('testTab=returns'), 'testTab=returns');
  assert.equal(parse('ship=bogus'), '');
  // `/tech` is a legacy alias the proxy redirects; it deliberately has no spec
  // of its own, so it must not resolve to `/test`'s.
  assert.equal(routeParamsFor('/tech'), null);
});

test('the mobile RouteShell pane param is ambient on every shell that mounts it', () => {
  // A live defect until 2026-07-29: `RouteShell` is a shared DS component read
  // through a constant, so no route declared `?pane=` and the hygiene hook
  // stripped it the instant the operator tapped the mobile Actions tab.
  for (const route of ['/test', '/sourcing', '/support', '/unbox', '/receiving/history']) {
    const spec = routeParamsFor(route)!;
    assert.equal(
      parseRouteParams(spec, new URLSearchParams('pane=actions')).get('pane'),
      'actions',
      `${route} drops ?pane= — its carries list is missing the ambient key`,
    );
  }
  // Still a closed vocabulary.
  const spec = routeParamsFor('/test')!;
  assert.equal(parseRouteParams(spec, new URLSearchParams('pane=bogus')).toString(), '');
});

test('/walk-in keeps the legacy deep-link keys its redirect reads', () => {
  const spec = routeParamsFor('/walk-in')!;
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();

  // `useWalkInTaskRedirect` reads these off the URL and forwards them to
  // `/pickup?job=repair`. Undeclared, the hygiene hook this page mounts would
  // strip them and a `?new=true` link would land on a plain history page. The
  // read guard could not catch it — `/repair` declares all three, so nothing
  // looked undeclared.
  assert.equal(parse('new=true'), 'new=true');
  assert.equal(parse('openRepair=42'), 'openRepair=42');
  assert.equal(parse('search=abc'), 'search=abc');
  // Repair tab values are forwarded too, so they must survive here.
  assert.equal(parse('tab=done'), 'tab=done');
  // Per-mode tab vocabularies (Pickup / Sales) also round-trip.
  assert.equal(parse('tab=draft'), 'tab=draft');
  assert.equal(parse('tab=today'), 'tab=today');
  assert.equal(parse('tab=bogus'), '');
  // Sales is the default and writers usually omit it — but a deep link that
  // writes `?mode=sales` must survive hygiene (same class as support `tickets`).
  assert.equal(parse('mode=sales'), 'mode=sales');
  assert.equal(parse('mode=pickup'), 'mode=pickup');
  assert.equal(parse('mode=repairs'), 'mode=repairs');
  assert.equal(parse('mode=repair'), 'mode=repair');
  // Legacy `?category=` is proxy-only (server-side, before this parse) and has
  // no client reader, so it is deliberately NOT declared.
  assert.equal(parse('category=repairs'), '');
});

test('/inventory declares the whole set its URL-state SoT reads', () => {
  const spec = routeParamsFor('/inventory')!;
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();

  // The old nav clear list nulled only `mode`/`section`/`open`, so everything
  // below rode a mode switch into the next mode.
  assert.equal(parse('sku=CABLE-001'), 'sku=CABLE-001');
  assert.equal(parse('bin=A1'), 'bin=A1');
  assert.equal(parse('unit=9'), 'unit=9');
  assert.equal(parse('state=IN_STOCK,SOLD'), 'state=IN_STOCK%2CSOLD');
  assert.equal(parse('condition=used'), 'condition=used');
  assert.equal(parse('field=serial'), 'field=serial');
  assert.equal(parse('filter=a,b'), 'filter=a%2Cb');

  // `open` here is an opaque selection KEY, not an id — `paramPositiveInt` (what
  // every other route uses for `open`) would have dropped it.
  assert.equal(parse('open=bin:A1'), 'open=bin%3AA1');

  // Graph direction accepts `parts`, which is absent from `SkuGraphMode` but is
  // read by `InventoryGraphRouter`.
  assert.equal(parse('view=parts'), 'view=parts');
  assert.equal(parse('view=tree'), 'view=tree');
  assert.equal(parse('view=nope'), '');

  // `section` only ever means Replenish here.
  assert.equal(parse('section=replenish'), 'section=replenish');
  assert.equal(parse('section=velocity'), '');

  // A sibling surface's state still dies at the boundary.
  assert.equal(parse('triq=BOX-9&unboxview=queue'), '');
});
