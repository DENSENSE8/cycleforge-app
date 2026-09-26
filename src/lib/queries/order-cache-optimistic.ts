import type { QueryClient, QueryKey } from '@tanstack/react-query';

type CacheRow = Record<string, unknown>;

const ORDER_LIST_PREFIXES: readonly QueryKey[] = [
  ['dashboard-table', 'pending'],
  ['dashboard-table', 'unshipped'],
  ['dashboard-table', 'shipped'],
  ['dashboard-table', 'shipped-fba'],
  ['shipped-table'],
  ['orders'],
  ['shipped'],
];

function rowOrderId(row: CacheRow): number | null {
  const value = row.order_row_id ?? row.orderRowId ?? row.id;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function removeRows(value: unknown, ids: ReadonlySet<number>): unknown {
  if (Array.isArray(value)) {
    return value.filter((row) => {
      if (!row || typeof row !== 'object') return true;
      const id = rowOrderId(row as CacheRow);
      return id == null || !ids.has(id);
    });
  }
  if (!value || typeof value !== 'object') return value;

  const bag = value as Record<string, unknown>;
  let changed = false;
  const next = { ...bag };
  for (const key of ['orders', 'results', 'shipped', 'rows', 'data']) {
    if (!Array.isArray(bag[key])) continue;
    const filtered = removeRows(bag[key], ids);
    if (filtered !== bag[key]) {
      next[key] = filtered;
      changed = true;
    }
  }
  return changed ? next : value;
}

/**
 * Remove order rows by the database `orders.id` from every mounted and cached
 * outbound list immediately. The returned rollback restores the exact cache
 * snapshots if the server mutation fails.
 */
export function optimisticallyRemoveOrderRows(
  queryClient: QueryClient,
  orderIds: readonly number[],
): () => void {
  const ids = new Set(orderIds.map(Number).filter((id) => Number.isFinite(id) && id > 0));
  if (ids.size === 0) return () => {};

  const snapshots: Array<[QueryKey, unknown]> = [];
  for (const queryKey of ORDER_LIST_PREFIXES) {
    for (const [key, data] of queryClient.getQueriesData({ queryKey })) {
      snapshots.push([key, data]);
      queryClient.setQueryData(key, removeRows(data, ids));
    }
  }

  return () => {
    for (const [key, data] of snapshots) queryClient.setQueryData(key, data);
  };
}

function optimisticallyRemoveOrderRow(
  queryClient: QueryClient,
  orderId: number,
): () => void {
  return optimisticallyRemoveOrderRows(queryClient, [orderId]);
}

