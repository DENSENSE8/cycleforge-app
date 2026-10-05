/**
 * A pressed pasted-list status chip must survive route hygiene: every bucket
 * the locator answers with — its own ids and another section's prefixed ids —
 * stays in the URL (2026-10-04: Awaiting tracking snapped back to All).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRouteParams } from './route-params';
import { INCOMING_ROUTE_PARAMS } from './receiving-routes';
import { routeParamsFor } from './registry';
import { isLocateBucketId } from './locate-bucket-param';

test('every inbound bucket id survives Incoming hygiene, junk does not', () => {
  for (const id of ['awaiting_tracking', 'received', 'not_received', 'exceptions', 'outbound:triage', 'nowhere']) {
    const next = parseRouteParams(INCOMING_ROUTE_PARAMS, new URLSearchParams(`ref_in=A-1,B-2&recon=${id}`));
    assert.equal(next.get('recon'), id, id);
  }
  for (const junk of ['awaiting', 'inbound:received', 'outbound:nope', 'nowhere:triage', '']) {
    const next = parseRouteParams(INCOMING_ROUTE_PARAMS, new URLSearchParams(`ref_in=A-1,B-2&recon=${junk}`));
    assert.equal(next.get('recon'), null, junk);
  }
});

test('a ref found in Receiving keeps its prefixed chip on the Shipping desk', () => {
  const spec = routeParamsFor('/shipping/orders');
  assert.ok(spec);
  for (const id of ['inbound:received', 'inbound:awaiting_tracking', 'triage']) {
    const next = parseRouteParams(spec, new URLSearchParams(`refs=A-1,B-2&located=${id}`));
    assert.equal(next.get('located'), id, id);
  }
  assert.equal(parseRouteParams(spec, new URLSearchParams('refs=A-1&located=outbound:triage')).get('located'), null);
});

test('isLocateBucketId: own ids, other sections prefixed, never the own prefix', () => {
  assert.equal(isLocateBucketId('inbound', 'awaiting_tracking'), true);
  assert.equal(isLocateBucketId('outbound', 'inbound:exceptions'), true);
  assert.equal(isLocateBucketId('outbound', 'outbound:triage'), false);
  assert.equal(isLocateBucketId('inbound', 'triage'), false);
});
