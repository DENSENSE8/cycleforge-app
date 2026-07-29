'use client';

/**
 * Labels-mode sidebar rail — "Labels printed" (staged queue, newest label
 * first). Composes `SidebarRecentRailBase` / `RailRowBody` (never a forked
 * list); selecting a row opens the focused label workspace via `?open=` —
 * the same flow as a Queue-tab row click.
 *
 * Row anatomy matches Unbox Recent: title + second-row `n/n` qty (emerald when
 * complete). Order / platform / SKU stay in the workspace.
 */

import { useCallback, useMemo } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody, type RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import { fetchStagedOrdersData } from '@/lib/outbound/outbound-table-data';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

const RAIL_LIMIT = 12;

function orderQty(row: { quantity?: string | number | null }): number {
  return Math.max(1, parseInt(String(row.quantity || '1'), 10) || 1);
}

/** Glance rail: product title + Unbox-style n/n (labeled orders are complete). */
function orderRowVM(row: {
  order_id: string;
  product_title: string;
  sku: string;
  quantity?: string | number | null;
}): RailRowVM {
  const qty = orderQty(row);
  return {
    title: row.product_title || row.sku || `#${row.order_id}`,
    titleAttr: row.product_title || undefined,
    meta: (
      <span className="block truncate font-semibold uppercase tracking-widest text-text-soft">
        <span className="text-emerald-600">
          {qty}/{qty}
        </span>
      </span>
    ),
  };
}

const getPrintedActivityAt = (row: ShippedOrder) =>
  row.label_printed_at ?? row.packed_at ?? row.created_at ?? '';

export function LabelsRecentRail() {
  const { open, setOpen } = useOutboundUrlState();

  const openOrder = useCallback(
    (id: number) => setOpen(open === id ? null : id),
    [open, setOpen],
  );

  const printedFetch = useCallback(async (): Promise<ShippedOrder[]> => {
    const rows = await fetchStagedOrdersData({ searchQuery: '' });
    return [...rows]
      .sort(
        (a, b) =>
          (Date.parse(String(getPrintedActivityAt(b))) || 0) -
          (Date.parse(String(getPrintedActivityAt(a))) || 0),
      )
      .slice(0, RAIL_LIMIT);
  }, []);

  const printedQueryKey = useMemo(() => ['labels-rail', 'printed'] as const, []);

  return (
    <SidebarRecentRailBase<ShippedOrder>
      queryKey={printedQueryKey}
      fetchFn={printedFetch}
      refreshDomains={['orders.outbound']}
      selectedId={open}
      limit={RAIL_LIMIT}
      eyebrowTitle="Labels printed"
      emptyText="No labeled orders staged yet"
      getId={(row) => Number(row.id)}
      getActivityAt={getPrintedActivityAt}
      onSelect={(row) => openOrder(Number(row.id))}
      getStatusDot={() => 'bg-emerald-500'}
      getStatusDotLabel={() => 'Label printed · staged for dock'}
      renderRowMain={(row) => <RailRowBody className="flex-1" vm={orderRowVM(row)} />}
    />
  );
}
