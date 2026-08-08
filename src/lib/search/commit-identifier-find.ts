/**
 * Shared identifier commit for header find + ⌘K find mode.
 *
 * Both surfaces must resolve serial / order # / tracking the same way:
 * `resolveSearchOrder` → seed the TanStack cache → navigate to order feedback
 * on hit, or stay open on miss / FBA. Free-text handoff stays in the host.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ShippedOrder } from '@/types/orders';
import {
  resolveSearchOrder,
  type ResolvedSearchOrder,
} from '@/lib/search/resolve-search-order';
import { setSearchOrderResolveCache } from '@/lib/search/search-order-resolve-query';
import { orderRecordHref } from '@/lib/search/search-hit';

export type CommitIdentifierFindResult =
  | {
      kind: 'navigate';
      href: string;
      orderId: number;
      order: ShippedOrder;
      resolved: Extract<ResolvedSearchOrder, { status: 'ok' }>;
    }
  | {
      kind: 'stay';
      resolved: Exclude<ResolvedSearchOrder, { status: 'ok' }>;
    };

/**
 * Resolve an identifier-shaped query and seed the search-order cache.
 * Callers navigate on `kind: 'navigate'` or keep their overlay open on `stay`.
 */
export async function commitIdentifierFind(
  queryClient: QueryClient,
  query: string,
): Promise<CommitIdentifierFindResult> {
  const trimmed = query.trim();
  const resolved = await resolveSearchOrder(trimmed);
  setSearchOrderResolveCache(queryClient, trimmed, resolved);
  if (resolved.status === 'ok') {
    return {
      kind: 'navigate',
      href: orderRecordHref(resolved.order.id),
      orderId: resolved.order.id,
      order: resolved.order,
      resolved,
    };
  }
  return { kind: 'stay', resolved };
}

/** Preview-hit href — orders always land on search feedback (same as header find). */
export function hrefForPreviewHit(hit: {
  entityType: string;
  id: number;
  href: string;
}): string {
  if (hit.entityType === 'order') return orderRecordHref(hit.id);
  return hit.href;
}
