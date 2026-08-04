import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parsePickupStatusTab,
  pickupOrderIsDone,
  pickupOrderNeedsProcess,
  pickupOrderStatusChipClass,
  pickupOrderStatusDot,
  pickupOrderStatusLabel,
} from './order-status';

describe('pickup order-status SoT', () => {
  it('treats COMPLETED (any case) as Done', () => {
    assert.equal(pickupOrderIsDone('COMPLETED'), true);
    assert.equal(pickupOrderIsDone('completed'), true);
    assert.equal(pickupOrderIsDone('DRAFT'), false);
    assert.equal(pickupOrderIsDone(null), false);
    assert.equal(pickupOrderIsDone(undefined), false);
    assert.equal(pickupOrderIsDone(''), false);
  });

  it('Need to process = DRAFT + items + no receiving_id', () => {
    assert.equal(
      pickupOrderNeedsProcess({ status: 'DRAFT', receivingId: null, itemCount: 2 }),
      true,
    );
    assert.equal(
      pickupOrderNeedsProcess({ status: 'DRAFT', receivingId: 99, itemCount: 2 }),
      false,
    );
    assert.equal(
      pickupOrderNeedsProcess({ status: 'DRAFT', receivingId: null, itemCount: 0 }),
      false,
    );
    assert.equal(
      pickupOrderNeedsProcess({ status: 'COMPLETED', receivingId: null, itemCount: 2 }),
      false,
    );
  });

  it('maps Done / Need to process / Draft labels', () => {
    assert.equal(pickupOrderStatusDot('COMPLETED'), 'bg-emerald-500');
    assert.equal(pickupOrderStatusDot('DRAFT'), 'bg-amber-400');
    assert.equal(pickupOrderStatusLabel('COMPLETED'), 'Done');
    assert.equal(pickupOrderStatusLabel('DRAFT', { receivingId: null }), 'Need to process');
    assert.equal(pickupOrderStatusLabel('DRAFT', { receivingId: 1 }), 'Draft');
  });

  it('chip classes agree with Done/Draft tones', () => {
    assert.match(pickupOrderStatusChipClass('COMPLETED'), /emerald/);
    assert.match(pickupOrderStatusChipClass('DRAFT'), /amber/);
  });

  it('parses ?status= tabs', () => {
    assert.equal(parsePickupStatusTab(null), 'all');
    assert.equal(parsePickupStatusTab('process'), 'process');
    assert.equal(parsePickupStatusTab('draft'), 'draft');
    assert.equal(parsePickupStatusTab('done'), 'done');
    assert.equal(parsePickupStatusTab('nope'), 'all');
  });
});
