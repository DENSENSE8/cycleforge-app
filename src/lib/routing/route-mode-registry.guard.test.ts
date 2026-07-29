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
