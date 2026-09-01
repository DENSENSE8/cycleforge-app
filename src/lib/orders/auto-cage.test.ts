import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAutoCageIds, type AutoCageCandidate } from './auto-cage-core';

const cand = (over: Partial<AutoCageCandidate>): AutoCageCandidate => ({
  id: 1,
  status: 'unassigned',
  paired: false,
  ...over,
});

test('an unpaired new order is caged', () => {
  assert.deepEqual(selectAutoCageIds([cand({ id: 7 })]), [7]);
});

test('a paired order is accepted — paperwork gaps are To-ship, not the cage', () => {
  assert.deepEqual(selectAutoCageIds([cand({ id: 7, paired: true })]), []);
});

test('an already-shipped row never cages, however unpaired', () => {
  // The eBay lane imports 30 days of already-fulfilled orders and Amazon FBA
  // rows land status='shipped' — those need no triage and must not flood the
  // exceptions desk (R-FLOW-2 guard).
  assert.deepEqual(selectAutoCageIds([cand({ id: 7, status: 'shipped' })]), []);
  assert.deepEqual(selectAutoCageIds([cand({ id: 7, status: '  SHIPPED ' })]), []);
});

test('blank and unassigned statuses are cageable when unpaired', () => {
  for (const status of [null, '', '   ', 'unassigned']) {
    assert.deepEqual(selectAutoCageIds([cand({ id: 3, status })]), [3], `status=${JSON.stringify(status)}`);
  }
});

test('the split partitions a mixed batch', () => {
  const batch = [
    cand({ id: 1 }), // unpaired → caged
    cand({ id: 2, paired: true }), // paired → accepted (label/docs later)
    cand({ id: 3, status: 'shipped' }), // fulfilled import → accepted
    cand({ id: 4 }), // unpaired → caged
  ];
  assert.deepEqual(selectAutoCageIds(batch), [1, 4]);
});
