import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingSummary } from '@/components/sidebar/receiving/incoming/incoming-summary-types';
import { incomingPipelineFacets } from './incoming-pipeline';

const SUMMARY: IncomingSummary = {
  issued: 40,
  delivered_unopened: 3,
  delivered_not_unboxed: 9,
  delivered_unscanned_claims: 1,
  arriving_today: 2,
  stalled: 4,
  in_transit: 12,
  pending_carrier: 5,
  carrier_mismatch: 1,
  tracking_unavailable: 0,
  awaiting_tracking: 7,
  expected_today: 2,
};

test('delivery-state facet counts the lane summary in walk order; total follows ?state=', async () => {
  let reads = 0;
  const read = async () => {
    reads += 1;
    return SUMMARY;
  };

  const all = await incomingPipelineFacets(new URLSearchParams(), read);
  assert.equal(all.context, 'incoming.pipeline');
  assert.equal(all.total, 40);
  assert.deepEqual(all.groups, [{
    id: 'state',
    label: 'Delivery status',
    param: 'state',
    options: [
      { value: 'DELIVERED_UNOPENED', label: 'Delivered · not scanned', count: 3 },
      { value: 'ARRIVING_TODAY', label: 'Arriving today', count: 2 },
      { value: 'IN_TRANSIT', label: 'In transit', count: 12 },
      { value: 'AWAITING_TRACKING', label: 'Awaiting tracking', count: 7 },
    ],
  }]);

  const transit = await incomingPipelineFacets(new URLSearchParams({ state: 'in_transit' }), read);
  assert.equal(transit.total, 12);
  assert.equal(reads, 2);
});

test('a pasted list and the Exceptions lane ignore ?state=: nothing to pick, no summary read', async () => {
  const read = async (): Promise<IncomingSummary> => {
    throw new Error('summary must not be read');
  };
  for (const params of [new URLSearchParams({ ref_in: 'PO-1,PO-2' }), new URLSearchParams({ lane: 'exceptions' })]) {
    const body = await incomingPipelineFacets(params, read);
    assert.equal(body.total, 0);
    assert.deepEqual(body.groups.map((group) => [group.id, group.options.length]), [['state', 0]]);
  }
});
