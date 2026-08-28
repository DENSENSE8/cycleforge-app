import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDashboardPendingLayoutFromSearch,
  normalizeDashboardOrderViewParams,
} from './dashboard-search-state';

test('getDashboardPendingLayoutFromSearch: always grid (board|grid retired)', () => {
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('')), 'grid');
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('view=grid')), 'grid');
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('view=board')), 'grid');
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('unshipped=')), 'grid');
});

test('normalizeDashboardOrderViewParams: strips stale ?view=; desk stays unshipped', () => {
  for (const view of ['unshipped', 'tested', 'packed', 'shipped', 'fba'] as const) {
    const params = new URLSearchParams('view=grid');
    const next = normalizeDashboardOrderViewParams(params, view as 'unshipped' | 'tested' | 'packed' | 'shipped');
    assert.equal(params.has('view'), false, `view should be cleared for ${view}`);
    assert.equal(next, 'unshipped');
    assert.equal(params.has('unshipped'), true);
    assert.equal(params.has('shipped'), false);
    assert.equal(params.has('tested'), false);
    assert.equal(params.has('packed'), false);
  }
});
