import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fbaOutboundHref,
  resolveFbaMode,
  resolveFbaModeFromSearchParams,
} from './fba-modes';

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

test('fbaOutboundHref builds outbound FBA deep links', () => {
  assert.equal(fbaOutboundHref(), '/shipping?mode=fba');
  assert.equal(fbaOutboundHref({ fbaMode: 'plan' }), '/shipping?mode=fba&fbaMode=plan');
  assert.equal(
    fbaOutboundHref({ fbaMode: 'combine', openShipmentId: 42 }),
    '/shipping?mode=fba&openShipmentId=42',
  );
});
