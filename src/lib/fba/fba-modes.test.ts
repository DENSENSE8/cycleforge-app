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
  assert.equal(resolveFbaMode('ready'), 'ready');
});

test('resolveFbaModeFromSearchParams prefers fbaMode over outbound mode', () => {
  const params = new URLSearchParams('mode=fba&fbaMode=plan');
  assert.equal(resolveFbaModeFromSearchParams(params), 'plan');
  assert.equal(resolveFbaModeFromSearchParams(new URLSearchParams('mode=fba')), 'combine');
  assert.equal(resolveFbaModeFromSearchParams(new URLSearchParams('mode=shipped')), 'shipped');
  assert.equal(resolveFbaModeFromSearchParams(new URLSearchParams('fbaMode=ready')), 'ready');
});

test('fbaOutboundHref builds /shipping/fba deep links', () => {
  assert.equal(fbaOutboundHref(), '/shipping/fba');
  assert.equal(fbaOutboundHref({ fbaMode: 'plan' }), '/shipping/fba?fbaMode=plan');
  assert.equal(fbaOutboundHref({ fbaMode: 'ready' }), '/shipping/fba?fbaMode=ready');
  assert.equal(
    fbaOutboundHref({ fbaMode: 'combine', openShipmentId: 42 }),
    '/shipping/fba?openShipmentId=42',
  );
});

test('every param the legacy /fba redirect forwards is declared at its destination', () => {
  // `/fba` is a server-side redirect, so it correctly has NO spec of its own —
  // asserted here so nobody "completes the isolation tier" by giving it one.
  assert.equal(routeParamsFor('/fba'), null);

  // The redirect is a HAND-OFF:
  const spec = routeParamsFor(FBA_OUTBOUND_PATH)!;
  const probes: Record<string, string> = {
    [FBA_MODE_PARAM]: 'plan',
    openShipmentId: '1',
    ...Object.fromEntries(FBA_LEGACY_REDIRECT_FORWARDED_PARAMS.map((k) => [k, '1'])),
  };
  const dropped = Object.entries(probes)
    .filter(([key, value]) => !parseRouteParams(spec, new URLSearchParams(`${key}=${value}`)).has(key))
    .map(([key]) => key);
  assert.deepEqual(
    dropped,
    [],
    'These keys ride the /fba redirect but are not owned by the /shipping/fba spec, ' +
      'so the boundary parse drops them on arrival. Declare them in ' +
      'src/lib/routing/outbound-routes.ts.',
  );
});
