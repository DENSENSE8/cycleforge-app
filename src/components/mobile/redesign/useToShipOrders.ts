'use client';

/**
 * To-ship queue for the mobile `/m/work` list.
 *
 * Reuses {@link unshippedOrdersQuery} — the same in-warehouse fetch the
 * desktop to-ship table already uses — so assignment writes on that desk
 * show up here without a second orders API.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pendingOrdersQuery, unshippedOrdersQuery } from '@/lib/queries/dashboard-queries';
import {
  bandWorkOrderRows,
  type DeadlineBandGroup,
} from '@/lib/work-orders/deadline-bands';
import { shippedOrdersAsWorkRows } from '@/lib/work-orders/shipped-as-work-row';
import type { WorkOrderRow } from '@/components/work-orders/types';

/** Phone list ceiling — the desk paginates; this is one scroll of the queue. */
export const MOBILE_TO_SHIP_LIST_LIMIT = 150;

export type MobileToShipFeed = 'unshipped' | 'pending';

export function useToShipOrders({
  enabled,
  searchQuery = '',
  feed = 'unshipped',
}: {
  enabled: boolean;
  searchQuery?: string;
  feed?: MobileToShipFeed;
}): {
  rows: WorkOrderRow[];
  groups: DeadlineBandGroup[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
} {
  const q = searchQuery.trim();
  const unshipped = useQuery({
    ...unshippedOrdersQuery({
      searchQuery: q,
      limit: q ? undefined : MOBILE_TO_SHIP_LIST_LIMIT,
    }),
    enabled: enabled && feed === 'unshipped',
  });
  const pending = useQuery({
    ...pendingOrdersQuery({ searchQuery: q }),
    enabled: enabled && feed === 'pending',
  });
  const active = feed === 'pending' ? pending : unshipped;
  const { data, isPending, isError, isFetching } = active;

  const rows = useMemo(() => shippedOrdersAsWorkRows(data ?? []), [data]);
  const groups = useMemo(() => bandWorkOrderRows(rows), [rows]);

  return {
    rows,
    groups,
    isPending: enabled && isPending,
    isError,
    isFetching,
  };
}
