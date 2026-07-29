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

test('Incoming and History read `sort` with their own vocabularies', () => {
  const incoming = new URLSearchParams('sort=zoho_oldest');
  const history = new URLSearchParams('sort=unboxed_newest');
  assert.equal(parseRouteParams(INCOMING_ROUTE_PARAMS, incoming).get('sort'), 'zoho_oldest');
  assert.equal(parseRouteParams(HISTORY_ROUTE_PARAMS, history).get('sort'), 'unboxed_newest');
  // Each rejects the other's values — the shared key is not a shared vocabulary.
  assert.equal(parseRouteParams(INCOMING_ROUTE_PARAMS, history).get('sort'), null);
  assert.equal(parseRouteParams(HISTORY_ROUTE_PARAMS, incoming).get('sort'), null);
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
  const url = buildRouteUrl(PRODUCTS_ROUTE_PARAMS, { view: 'catalog', staff: 7 });
  assert.equal(url, '/products?view=catalog&staff=7');
});

test('/products drops another view\'s state on arrival', () => {
  const leaked = new URLSearchParams(
    'view=catalog&skuId=4821&q=laptop&historyId=99&sort=title&labelsView=recent',
  );
  const next = parseRouteParams(PRODUCTS_ROUTE_PARAMS, leaked);
  // Declared, so a pasted deep-link into one view keeps working…
  assert.equal(next.get('view'), 'catalog');
  // …while a value that only makes sense elsewhere still dies at the boundary.
  assert.equal(parseRouteParams(PRODUCTS_ROUTE_PARAMS, new URLSearchParams('triq=BOX-9')).toString(), '');
});

test('/products validates each view vocabulary through its own parser', () => {
  const parse = (qs: string) => parseRouteParams(PRODUCTS_ROUTE_PARAMS, new URLSearchParams(qs));
  // Composed from parseProductsView / parseLabelsView / parseLinkFilter, so a
  // value the surface would reject cannot sit in the URL pretending to be real.
  assert.equal(parse('view=kit').get('view'), 'kit');
  assert.equal(parse('view=nope').get('view'), null);
  assert.equal(parse('labelsView=recent').get('labelsView'), 'recent');
  assert.equal(parse('labelsView=nope').get('labelsView'), null);
  assert.equal(parse('linkFilter=unlinked_pending').get('linkFilter'), 'unlinked_pending');
  assert.equal(parse('linkFilter=nope').get('linkFilter'), null);
  assert.equal(parse('sort=title').get('sort'), 'title');
  assert.equal(parse('sort=zoho_oldest').get('sort'), null);
  // A catalog refine flag is present-means-on, never free text.
  assert.equal(parse('pending=1').get('pending'), '1');
  assert.equal(parse('pending=maybe').get('pending'), null);
});

test('a Products selection cannot survive a landing on a receiving surface', () => {
  const leaked = new URLSearchParams('skuId=4821&labelsView=recent&historyId=99');
  assert.equal(parseRouteParams(UNBOX_ROUTE_PARAMS, leaked).toString(), '');
});

// ── /dashboard — the lifecycle tabs are BARE presence flags ──────────────────

test('a bare dashboard lifecycle flag survives the boundary parse', () => {
  const spec = routeParamsFor('/dashboard')!;
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();

  // `?shipped` (no `=`) is what the app writes and what `.has()` reads. Under
  // the old `paramText` declaration every one of these parsed to "" and the
  // lifecycle tab silently reverted to Unshipped.
  for (const flag of ['unshipped', 'pending', 'packed', 'tested', 'shipped', 'fba', 'warranty']) {
    assert.equal(parse(flag), `${flag}=`, `?${flag} must survive as a presence flag`);
  }
  // Every accepted spelling normalizes to the bare form `.has()` tests for.
  assert.equal(parse('shipped=1'), 'shipped=');
  // …but it is still a flag, not free text.
  assert.equal(parse('shipped=garbage'), '');
});

test('/dashboard declares the params its own components read', () => {
  const spec = routeParamsFor('/dashboard')!;
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).get(qs.split('=')[0]!);

  // `searchScopeHref('ORDER')` hands off to `/dashboard?search=`, and
  // PackedOrdersTable reads it — undeclared, it was dropped on arrival.
  assert.equal(parse('search=widget'), 'widget');
  // OutboundFilterStrip's two facets.
  assert.equal(parse('attention=1'), '1');
  assert.equal(parse('ustatus=TESTED'), 'TESTED');
});

test('routeParamsFor resolves the longest route first', () => {
  assert.equal(routeParamsFor('/receiving/history')?.route, '/receiving/history');
  assert.equal(routeParamsFor('/unbox')?.route, '/unbox');
  assert.equal(routeParamsFor('/unbox/anything')?.route, '/unbox');
  // Bare `/receiving` and the unfound sub-tree stay un-owned for now.
  assert.equal(routeParamsFor('/receiving'), null);
  assert.equal(routeParamsFor('/receiving/unfound'), null);
  assert.equal(routeParamsFor('/test'), null);
});
