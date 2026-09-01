import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAutoCageIds, type AutoCageCandidate } from './auto-cage-core';

const cand = (over: Partial<AutoCageCandidate>): AutoCageCandidate => ({
  id: 1,
  status: 'unassigned',
  canRelease: false,
  ...over,
});

test('a blocked new order is caged', () => {
  assert.deepEqual(selectAutoCageIds([cand({ id: 7 })]), [7]);
});

test('a clean order is accepted — gates green means no cage', () => {
  assert.deepEqual(selectAutoCageIds([cand({ id: 7, canRelease: true })]), []);
});

test('an already-shipped row never cages, however red its gates', () => {
  // The eBay lane imports 30 days of already-fulfilled orders and Amazon FBA
  // rows land status='shipped' — those need no triage and must not flood the
  // exceptions desk (R-FLOW-2 guard).
  assert.deepEqual(selectAutoCageIds([cand({ id: 7, status: 'shipped' })]), []);
  assert.deepEqual(selectAutoCageIds([cand({ id: 7, status: '  SHIPPED ' })]), []);
});

test('blank and unassigned statuses are cageable', () => {
  for (const status of [null, '', '   ', 'unassigned']) {
    assert.deepEqual(selectAutoCageIds([cand({ id: 3, status })]), [3], `status=${JSON.stringify(status)}`);
  }
});

test('the split partitions a mixed batch', () => {
  const batch = [
    cand({ id: 1 }), // blocked → caged
    cand({ id: 2, canRelease: true }), // clean → accepted
    cand({ id: 3, status: 'shipped' }), // fulfilled import → accepted
    cand({ id: 4 }), // blocked → caged
  ];
  assert.deepEqual(selectAutoCageIds(batch), [1, 4]);
});
