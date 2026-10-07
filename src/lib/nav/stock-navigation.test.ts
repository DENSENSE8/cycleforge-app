import assert from 'node:assert/strict';
import test from 'node:test';
import { applyChildTarget, getSidebarPageNav, resolveSidebarChild } from '@/lib/sidebar-navigation';

test('Stock exposes Overview plus its operational saved views', () => {
  const page = getSidebarPageNav('stock');
  assert.ok(page);
  assert.deepEqual(
    page.children?.map(({ id, label }) => ({ id, label })),
    [
      { id: 'overview', label: 'Overview' },
      { id: 'all', label: 'All stock' },
      { id: 'replenish', label: 'Needs replenishment' },
      { id: 'low-stock', label: 'Low stock' },
      { id: 'out-of-stock', label: 'Out of stock' },
    ],
  );
});

test('Stock saved-view URLs resolve to the matching contextual row', () => {
  const resolve = (query = '') => resolveSidebarChild('stock', {
    pathname: '/inventory/stock',
    params: new URLSearchParams(query),
  });

  assert.equal(resolve(), 'overview');
  assert.equal(resolve('view=all'), 'all');
  assert.equal(resolve('view=replenish'), 'replenish');
  assert.equal(resolve('view=replenish&rtab=fifo'), 'replenish');
  assert.equal(resolve('status=low-stock'), 'low-stock');
  assert.equal(resolve('status=out-of-stock'), 'out-of-stock');
});

test('Stock view hrefs stay distinct after route-param parsing', () => {
  const page = getSidebarPageNav('stock');
  assert.ok(page);
  const bare = { pathname: '/inventory/stock', params: new URLSearchParams() };
  const hrefs = (page.children ?? []).map((child) => {
    const target = applyChildTarget(bare, child.to());
    return target.search ? `${target.pathname}?${target.search}` : target.pathname;
  });
  assert.deepEqual(hrefs, [
    '/inventory/stock',
    '/inventory/stock?view=all',
    '/inventory/stock?view=replenish',
    '/inventory/stock?status=low-stock',
    '/inventory/stock?status=out-of-stock',
  ]);
  assert.equal(new Set(hrefs).size, hrefs.length);
});
