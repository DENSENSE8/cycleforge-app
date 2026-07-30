import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FBA_LEGACY_REDIRECT_FORWARDED_PARAMS,
  FBA_MODE_PARAM,
  FBA_OUTBOUND_PATH,
  fbaOutboundHref,
  resolveFbaMode,
  resolveFbaModeFromSearchParams,
} from './fba-modes';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';

test('resolveFbaMode defaults to combine', () => {
  assert.equal(resolveFbaMode(null), 'combine');
  assert.equal(resolveFbaMode('bogus'), 'combine');
  assert.equal(resolveFbaMode('plan'), 'plan');
});

test('resolveFbaModeFromSearchParams prefers fbaMode over outbound mode', () => {
  const params = new URLSearchParams('mode=fba&fbaMode=plan');
  assert.equal(resolveFbaModeFromSearchParams(params), 'plan');
  assert.equal(resolveFbaModeFromSearchParams(new URLSearchParams('mode=fba')), 'combine');
  assert.equal(resolveFbaModeFromSearchParams(new URLSearchParams('mode=shipped')), 'shipped');
});

test('fbaOutboundHref builds /shipping/fba deep links', () => {
  assert.equal(fbaOutboundHref(), '/shipping/fba');
  assert.equal(fbaOutboundHref({ fbaMode: 'plan' }), '/shipping/fba?fbaMode=plan');
  assert.equal(
    fbaOutboundHref({ fbaMode: 'combine', openShipmentId: 42 }),
    '/shipping/fba?openShipmentId=42',
  );
});

test('every param the legacy /fba redirect forwards is declared at its destination', () => {
  // `/fba` is a server-side redirect, so it correctly has NO spec of its own —
  // asserted here so nobody "completes the isolation tier" by giving it one.
  assert.equal(routeParamsFor('/fba'), null);

  // The redirect is a HAND-OFF: an undeclared key is dropped the moment
  // `/shipping/fba` boundary-parses, which would silently lose an old bookmark's
  // focused shipment or filters. Same defect class as `/walk-in`'s legacy
  // deep-links, caught there only after the fact.
  const spec = routeParamsFor(FBA_OUTBOUND_PATH)!;
  const dropped = [FBA_MODE_PARAM, 'openShipmentId', ...FBA_LEGACY_REDIRECT_FORWARDED_PARAMS].filter(
    (key) => !parseRouteParams(spec, new URLSearchParams(`${key}=1`)).has(key),
  );
  assert.deepEqual(
    dropped,
    [],
    'These keys ride the /fba redirect but are not owned by the /shipping/fba spec, ' +
      'so the boundary parse drops them on arrival. Declare them in ' +
      'src/lib/routing/outbound-routes.ts.',
  );
});
