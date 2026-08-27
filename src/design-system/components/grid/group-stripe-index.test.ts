import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextGroupStripeIndex, stripeIndexForDateStart } from './group-stripe-index';

describe('group stripe index', () => {
  it('advances one slot per group (not per leaf)', () => {
    // Simulate: singleton, 2-line collapsed, singleton, 3-line collapsed
    const leafCounts = [1, 2, 1, 3];
    let stripe = 0;
    const bases: number[] = [];
    for (const _leaves of leafCounts) {
      bases.push(stripe);
      stripe = nextGroupStripeIndex(stripe);
    }
    assert.deepEqual(bases, [0, 1, 2, 3]);
    assert.equal(stripe, 4);
  });

  it('resets per day when day headers are shown', () => {
    const days: number[][] = [
      [1, 2],
      [1, 1, 1],
    ];
    const bases: number[] = [];
    let stripe = 0;
    for (const leafCounts of days) {
      stripe = stripeIndexForDateStart(stripe, true);
      for (const _ of leafCounts) {
        bases.push(stripe);
        stripe = nextGroupStripeIndex(stripe);
      }
    }
    assert.deepEqual(bases, [0, 1, 0, 1, 2]);
  });

  it('stays continuous across dates when day headers are hidden', () => {
    const days: number[][] = [
      [1, 2],
      [1, 1],
    ];
    const bases: number[] = [];
    let stripe = 0;
    for (const leafCounts of days) {
      stripe = stripeIndexForDateStart(stripe, false);
      for (const _ of leafCounts) {
        bases.push(stripe);
        stripe = nextGroupStripeIndex(stripe);
      }
    }
    assert.deepEqual(bases, [0, 1, 2, 3]);
  });
});
