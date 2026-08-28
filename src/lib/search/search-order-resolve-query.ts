/**
 * TanStack Query waist for {@link resolveSearchOrder}.
 *
 * Header find seeds the cache on a successful identifier resolve; search order
 * feedback reads the same keys so navigation paints content without a second
 * fetch / gray loading shell.
 */

import {
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import {
  resolveSearchOrder,
  resolveSearchOrderByPk,
  type ResolvedSearchOrder,
} from '@/lib/search/resolve-search-order';

const SEARCH_ORDER_RESOLVE_STALE_MS = 45_000;

/** Normalize a human query / id token for the resolve cache key. */
export function normalizeSearchOrderResolveKey(raw: string | number): string {
  return decodeURIComponent(String(raw ?? '')).trim();
}

/** Cache key by the lookup token the operator typed (or URL open id). */
export function searchOrderResolveQueryKey(token: string | number) {
  return ['search-order-resolve', normalizeSearchOrderResolveKey(token)] as const;
}

/** Alias key by numeric pk once known — seed only; feedback reads the string-id alias. */
export function searchOrderResolveByIdQueryKey(orderId: number) {
  return ['search-order-resolve', 'id', orderId] as const;
}

export function searchOrderResolveQuery(token: string | number) {
  const key = normalizeSearchOrderResolveKey(token);
  return queryOptions({
    queryKey: searchOrderResolveQueryKey(key),
    queryFn: () => resolveSearchOrder(key),
    staleTime: SEARCH_ORDER_RESOLVE_STALE_MS,
    enabled: key.length > 0,
  });
}

/**
 * `/search?sel=order:{pk}` — resolve by primary key. Do not route through
 * marketplace lookup (bare digits are order #s there, not `orders.id`).
 */
export function searchOrderByIdResolveQuery(orderId: number) {
  return queryOptions({
    queryKey: searchOrderResolveByIdQueryKey(orderId),
    queryFn: () => resolveSearchOrderByPk(orderId),
    staleTime: SEARCH_ORDER_RESOLVE_STALE_MS,
    enabled: Number.isSafeInteger(orderId) && orderId > 0,
  });
}

/**
 * Seed both the typed-token key and the numeric-id key so feedback opened via
 * `?sel=order:{id}` hits memory after a header resolve on a human order #.
 */
export function setSearchOrderResolveCache(
  queryClient: QueryClient,
  token: string,
  resolved: ResolvedSearchOrder,
): void {
  const normalized = normalizeSearchOrderResolveKey(token);
  if (normalized) {
    queryClient.setQueryData(searchOrderResolveQueryKey(normalized), resolved);
  }
  if (resolved.status === 'ok') {
    queryClient.setQueryData(searchOrderResolveByIdQueryKey(resolved.order.id), resolved);
    // Also alias bare numeric string of the pk.
    queryClient.setQueryData(searchOrderResolveQueryKey(String(resolved.order.id)), resolved);
  }
}
