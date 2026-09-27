'use client';

/**
 * Refresh domain → the TanStack query keys that read it. The app frame mounts
 * `useRefreshDomainQueries` once, so every `refreshDomain(…)` a local write
 * emits invalidates its readers' caches directly — a list repaints after a
 * local write whether or not the socket echo arrives, and no writer has to
 * remember a second buster beside the signal.
 *
 * Keys are prefixes; `invalidateQueries` refetches only the active matches.
 */

import { useEffect } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { OUTBOUND_QUERY_PREFIXES } from '@/lib/outbound/outbound-cache-keys';
import { qk } from '@/queries/keys';
import {
  REFRESH_EVENT,
  type RefreshDomain,
  type RefreshEventDetail,
} from './domains';

/**
 * Every read an order-row write can change: the desk tables (pending,
 * unshipped + counts, shipped, FBA), the outbound station queues, the order
 * record reads (`['orders', …]`: phone hub, search record, shipped record,
 * pack placement) and the shipment record. Shared with the `order.changed`
 * realtime handler so the socket and a local write refresh the same set.
 */
export const ORDER_WRITE_QUERY_KEYS: readonly QueryKey[] = [
  qk.dashboardTable.all,
  qk.shippedTable,
  ['shipped-table-fba'],
  ...OUTBOUND_QUERY_PREFIXES,
  ['outbound-search', 'labels-count'],
  ['orders'],
  ['shipment-record'],
];

const REFRESH_DOMAIN_QUERY_KEYS: Record<RefreshDomain, readonly QueryKey[]> = {
  'orders.outbound': ORDER_WRITE_QUERY_KEYS,
  'packer.logs': [['packer-logs']],
  'receiving.lines': [
    ['receiving-lines-table'],
    ['receiving-lines'],
    ['receiving-lines-incoming-summary'],
  ],
  'receiving.poLines': [['receiving-siblings'], ['receiving-po-detail']],
  repairs: [qk.repairs.all],
  replenish: [['replenish-need']],
  // A work-order assignment writes the order / repair row's tech + packer.
  'work-orders': [qk.dashboardTable.unshipped, qk.dashboardTable.pending, ...OUTBOUND_QUERY_PREFIXES, qk.repairs.all],
};

export function invalidateQueryKeys(queryClient: QueryClient, keys: readonly QueryKey[]): void {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
}

/** Invalidate the readers of every signalled domain, each key once. */
export function invalidateRefreshDomainQueries(
  queryClient: QueryClient,
  domains: readonly RefreshDomain[],
): void {
  const seen = new Set<string>();
  const keys: QueryKey[] = [];
  for (const domain of domains) {
    for (const key of REFRESH_DOMAIN_QUERY_KEYS[domain] ?? []) {
      const id = JSON.stringify(key);
      if (seen.has(id)) continue;
      seen.add(id);
      keys.push(key);
    }
  }
  invalidateQueryKeys(queryClient, keys);
}

/** The bus → cache bridge. Mounted once by the app frame (`RouteRealtimeMount`). */
export function useRefreshDomainQueries(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onRefresh = (event: Event) => {
      const domains = (event as CustomEvent<RefreshEventDetail>).detail?.domains;
      if (Array.isArray(domains)) invalidateRefreshDomainQueries(queryClient, domains);
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [queryClient]);
}
