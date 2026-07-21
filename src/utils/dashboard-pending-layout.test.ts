import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDashboardPendingLayoutFromSearch,
  normalizeDashboardOrderViewParams,
} from './dashboard-search-state';

test('getDashboardPendingLayoutFromSearch: ?view=grid → grid', () => {
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('view=grid')), 'grid');
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('view=GRID')), 'grid');
});

test('getDashboardPendingLayoutFromSearch: absent / other → board', () => {
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('')), 'board');
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('view=board')), 'board');
  assert.equal(getDashboardPendingLayoutFromSearch(new URLSearchParams('unshipped=')), 'board');
});

test('normalizeDashboardOrderViewParams: keeps ?view=grid while staying on Pending', () => {
  const params = new URLSearchParams('view=grid');
  normalizeDashboardOrderViewParams(params, 'unshipped');
  assert.equal(params.get('view'), 'grid');
  assert.equal(params.has('unshipped'), true);
});

test('normalizeDashboardOrderViewParams: drops ?view=grid when leaving Pending', () => {
  for (const other of ['packed', 'shipped', 'fba'] as const) {
    const params = new URLSearchParams('view=grid');
    normalizeDashboardOrderViewParams(params, other);
    assert.equal(params.has('view'), false, `view should be cleared for ${other}`);
    assert.equal(params.has(other), true);
  }
});
