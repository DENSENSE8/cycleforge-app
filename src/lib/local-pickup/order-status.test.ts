import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pickupOrderIsDone,
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

  it('maps Done → emerald / Draft → amber for dots + labels', () => {
    assert.equal(pickupOrderStatusDot('COMPLETED'), 'bg-emerald-500');
    assert.equal(pickupOrderStatusDot('DRAFT'), 'bg-amber-400');
    assert.equal(pickupOrderStatusLabel('COMPLETED'), 'Done');
    assert.equal(pickupOrderStatusLabel('DRAFT'), 'Draft');
  });

  it('chip classes agree with Done/Draft tones', () => {
    assert.match(pickupOrderStatusChipClass('COMPLETED'), /emerald/);
    assert.match(pickupOrderStatusChipClass('DRAFT'), /amber/);
  });
});
