'use client';

/** To-ship queue for the mobile `/m/work` list. */

import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pendingOrdersQuery, unshippedOrdersQuery } from '@/lib/queries/dashboard-queries';
import {
  bandWorkOrderRows,
  type DeadlineBandGroup,
} from '@/lib/work-orders/deadline-bands';
import { shippedOrderAsWorkRow } from '@/lib/work-orders/shipped-as-work-row';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { ShippedOrder } from '@/types/orders';

/** Phone list ceiling — the desk paginates; this is one scroll of the queue. */
const MOBILE_TO_SHIP_LIST_LIMIT = 150;

export type MobileToShipFeed = 'unshipped' | 'pending';

export function useMobileV2FulfillmentOrders({
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
  // A realtime cache patch preserves every untouched source-row reference.
  const workRowsBySource = useRef(new Map<number, { source: ShippedOrder; workRow: WorkOrderRow }>());
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

  const rows = useMemo(() => {
    const next = new Map<number, { source: ShippedOrder; workRow: WorkOrderRow }>();
    const workRows = (data ?? []).map((source) => {
      const cached = workRowsBySource.current.get(source.id);
      const workRow = cached?.source === source ? cached.workRow : shippedOrderAsWorkRow(source);
      next.set(source.id, { source, workRow });
      return workRow;
    });
    workRowsBySource.current = next;
    return workRows;
  }, [data]);
  const groups = useMemo(() => bandWorkOrderRows(rows), [rows]);

  return {
    rows,
    groups,
    isPending: enabled && isPending,
    isError,
    isFetching,
  };
}
