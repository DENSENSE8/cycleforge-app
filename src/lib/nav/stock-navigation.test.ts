import assert from 'node:assert/strict';
import test from 'node:test';
import { getSidebarPageNav, resolveSidebarChild } from '@/lib/sidebar-navigation';

test('Stock exposes only its five operational saved views', () => {
  const page = getSidebarPageNav('stock');
  assert.ok(page);
  assert.deepEqual(
    page.children?.map(({ id, label }) => ({ id, label })),
    [
      { id: 'all', label: 'All stock' },
      { id: 'replenish', label: 'Needs replenishment' },
      { id: 'fifo', label: 'Shipped FIFO' },
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

  assert.equal(resolve(), 'all');
  assert.equal(resolve('view=replenish'), 'replenish');
  assert.equal(resolve('view=replenish&rtab=fifo'), 'fifo');
  assert.equal(resolve('status=low-stock'), 'low-stock');
  assert.equal(resolve('status=out-of-stock'), 'out-of-stock');
});
