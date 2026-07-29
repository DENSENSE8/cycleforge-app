/**
 * Guards the mode registry ↔ route ↔ spec triangle for the receiving family.
 *
 * A sidebar mode whose target route has no spec is the failure mode this whole
 * slice exists to prevent: navigation would land somewhere the boundary parse
 * does not govern, and the old copy-forward behaviour would quietly return for
 * that one surface.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RECEIVING_MODE_ITEMS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';
import { RECEIVING_MODE_ROUTE_PARAMS, RECEIVING_ROUTE_PARAMS } from './receiving-routes';
import { routeParamsFor } from './registry';
import { buildRouteUrl } from './route-params';

test('mode ids are unique', () => {
  const ids = RECEIVING_MODE_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `Duplicate receiving mode id in ${ids.join(', ')}`);
});

test('every rail mode maps to a route spec', () => {
  for (const item of RECEIVING_MODE_ITEMS) {
    const spec = RECEIVING_MODE_ROUTE_PARAMS[item.id as keyof typeof RECEIVING_MODE_ROUTE_PARAMS];
    assert.ok(spec, `Rail mode "${item.id}" has no entry in RECEIVING_MODE_ROUTE_PARAMS.`);
  }
});

test("every mode's target route resolves back to the same spec", () => {
  for (const [mode, spec] of Object.entries(RECEIVING_MODE_ROUTE_PARAMS)) {
    const resolved = routeParamsFor(spec.route);
    assert.equal(
      resolved?.route,
      spec.route,
      `Mode "${mode}" targets ${spec.route}, which routeParamsFor does not resolve to ` +
        `its own spec (got ${resolved?.route ?? 'null'}). Check the registry's longest-first ordering.`,
    );
  }
});

test('every mode target is in the spec list', () => {
  const known = new Set(RECEIVING_ROUTE_PARAMS.map((spec) => spec.route));
  for (const [mode, spec] of Object.entries(RECEIVING_MODE_ROUTE_PARAMS)) {
    assert.ok(known.has(spec.route), `Mode "${mode}" targets an unregistered route ${spec.route}.`);
  }
});

/**
 * A `param: null` in a mode target is a hand-written clear list — the denylist
 * shape this refactor deleted nine of. On a route WITHOUT a spec it is still
 * load-bearing (navigation copies the query string forward, so the nulls are the
 * only thing stopping a leak). On a route WITH a spec it is **dead**:
 * `applyModeTarget` constructs from the delta and carries only `staff`, so the
 * nulls cannot affect the result — they are just a list someone must maintain
 * and will eventually forget to extend.
 *
 * This is an INVARIANT, not a sweep: it fails the moment a surface graduates to
 * a spec while keeping its clear list, which is exactly when the list becomes
 * dead and misleading. `/operations` carried 55 such entries across five modes
 * until 2026-07-29.
 */
test('a spec-backed route carries no dead param-clear list', () => {
  const offenders: string[] = [];

  for (const page of SIDEBAR_PAGE_NAV) {
    const modes = page.modes ?? [];

    // The page's SWITCH key — the param its modes use to say which one is
    // active. Derived, not assumed: `/dashboard` and `/support` switch on
    // `?mode=`, `/products` and `/tech` on `?view=`, `/warehouse` on `?tab=`.
    // A sibling setting it to a real value is what identifies it, so
    // `{ view: null }` on the default mode reads as "drop the switch", not as a
    // clear list.
    const switchKeys = new Set(
      modes.flatMap((mode) =>
        Object.entries(mode.to().params ?? {})
          .filter(([, value]) => typeof value === 'string' && value !== '')
          .map(([key]) => key),
      ),
    );

    for (const mode of modes) {
      const target = mode.to();
      if (!routeParamsFor(target.pathname)) continue; // no spec — nulls still do work
      const dead = Object.entries(target.params ?? {})
        .filter(([key, value]) => value === null && !switchKeys.has(key))
        .map(([key]) => key);
      if (dead.length) {
        offenders.push(`${page.id}/${mode.id} → ${target.pathname} clears ${dead.join(', ')}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'These mode targets null sibling params on a route that already declares a ' +
      'param spec. Navigation CONSTRUCTS for those routes, so the nulls are dead ' +
      'weight — delete them rather than maintaining a list that no longer runs.',
  );
});

test('a mode switch emits a clean URL — no mode state, no leftovers', () => {
  for (const [mode, spec] of Object.entries(RECEIVING_MODE_ROUTE_PARAMS)) {
    assert.equal(
      buildRouteUrl(spec),
      spec.route,
      `Switching to "${mode}" must land on a bare ${spec.route} when nothing is declared.`,
    );
    assert.equal(
      buildRouteUrl(spec, { staff: 7 }),
      `${spec.route}?staff=7`,
      `Switching to "${mode}" must carry the staff filter and nothing else.`,
    );
  }
});
