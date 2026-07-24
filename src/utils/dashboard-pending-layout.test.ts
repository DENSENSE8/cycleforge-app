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

test('normalizeDashboardOrderViewParams: strips stale ?view= on every tab', () => {
  for (const view of ['unshipped', 'tested', 'packed', 'shipped', 'fba'] as const) {
    const params = new URLSearchParams('view=grid');
    normalizeDashboardOrderViewParams(params, view);
    assert.equal(params.has('view'), false, `view should be cleared for ${view}`);
    assert.equal(params.has(view), true);
  }
});
