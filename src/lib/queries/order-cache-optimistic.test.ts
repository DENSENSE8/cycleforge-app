import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { optimisticallyRemoveOrderRows } from './order-cache-optimistic';

test('removes order rows by orders.id across queue and shipped cache shapes', () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['dashboard-table', 'unshipped', { search: '' }], {
    orders: [{ id: 12 }, { id: 13 }],
  });
  queryClient.setQueryData(['dashboard-table', 'shipped', 'week', '2026-09-14'], [
    { id: 900, order_row_id: 12 },
    { id: 901, order_row_id: 13 },
  ]);

  const rollback = optimisticallyRemoveOrderRows(queryClient, [12]);
  assert.deepEqual(
    queryClient.getQueryData(['dashboard-table', 'unshipped', { search: '' }]),
    { orders: [{ id: 13 }] },
  );
  assert.deepEqual(
    queryClient.getQueryData(['dashboard-table', 'shipped', 'week', '2026-09-14']),
    [{ id: 901, order_row_id: 13 }],
  );

  rollback();
  assert.deepEqual(
    queryClient.getQueryData(['dashboard-table', 'unshipped', { search: '' }]),
    { orders: [{ id: 12 }, { id: 13 }] },
  );
});
