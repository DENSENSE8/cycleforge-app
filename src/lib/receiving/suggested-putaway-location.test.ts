import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describePutawaySuggestion,
  pickSkuHistoryWinner,
  SKU_HISTORY_SAMPLE,
} from './suggested-putaway-location';

test('pickSkuHistoryWinner returns null on no history — never guesses', () => {
  assert.equal(pickSkuHistoryWinner([]), null);
  assert.equal(pickSkuHistoryWinner([{ locationId: 0 }]), null);
});

test('pickSkuHistoryWinner takes the most frequent bin, not the newest', () => {
  // Newest-first: 7 took the last one, but 4 took three of the five.
  const won = pickSkuHistoryWinner([
    { locationId: 7 },
    { locationId: 4 },
    { locationId: 4 },
    { locationId: 9 },
    { locationId: 4 },
  ]);
  assert.deepEqual(won, { locationId: 4, hits: 3, sampled: 5 });
});

test('pickSkuHistoryWinner breaks a frequency tie by recency', () => {
  // 3 and 8 each took two. 3 is newer, so the floor looks like 3 today.
  const won = pickSkuHistoryWinner([
    { locationId: 3 },
    { locationId: 8 },
    { locationId: 3 },
    { locationId: 8 },
  ]);
  assert.deepEqual(won, { locationId: 3, hits: 2, sampled: 4 });
});

test('pickSkuHistoryWinner ignores non-positive ids in both winner and sample', () => {
  const won = pickSkuHistoryWinner([
    { locationId: 0 },
    { locationId: 5 },
    { locationId: -1 },
    { locationId: 5 },
  ]);
  assert.deepEqual(won, { locationId: 5, hits: 2, sampled: 2 });
});

test('sample size is a declared constant, not an inline literal', () => {
  assert.equal(SKU_HISTORY_SAMPLE, 10);
});

test('sku_history basis names the SKU and both counts — the claim is auditable', () => {
  const d = describePutawaySuggestion({
    basis: 'sku_history',
    hits: 3,
    sampled: 10,
    sku: 'CF-1180',
  });
  assert.equal(d.eyebrow, 'Put this product here');
  assert.equal(d.basis, '3 of the last 10 CF-1180 went here.');
});

test('a single prior stage reads as one, not as "1 of the last 1"', () => {
  const d = describePutawaySuggestion({
    basis: 'sku_history',
    hits: 1,
    sampled: 1,
    sku: 'CF-1180',
  });
  assert.equal(d.basis, 'The last CF-1180 went here.');
});

test('recent_stage never borrows the stronger claim', () => {
  const d = describePutawaySuggestion({
    basis: 'recent_stage',
    hits: 1,
    sampled: 1,
    sku: null,
  });
  assert.match(d.basis, /No history for this SKU yet/);
  assert.doesNotMatch(d.basis, /went here\./);
});
