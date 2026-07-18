'use client';

/**
 * Labels-mode sidebar rails — "Labels printed" (staged queue, newest label
 * first) + the signed-in staffer's "Recently shipped" ship-outs. Composes
 * `SidebarRecentRailBase` / `RailRowBody` (never a forked list); selecting a
 * row opens the focused label workspace via `?open=` — the same flow as a
 * Queue-tab row click.
 */

import { useCallback, useMemo } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody, type RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import { fetchStagedOrdersData } from '@/lib/outbound/outbound-table-data';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { sourcePlatformLabel } from '@/lib/source-platform';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

const RAIL_LIMIT = 12;

/** Flat row of GET /api/orders/recent (personalized ship-out slice). */
interface RecentShipOutRow {
  id: number;
  order_id: string;
  product_title: string;
  sku: string;
  quantity?: string | number | null;
  account_source?: string | null;
  tracking_number?: string | null;
  is_shipped?: boolean;
  ship_confirmed_at?: string | null;
  created_at: string;
}

function orderRowVM(row: {
  order_id: string;
  product_title: string;
  sku: string;
  quantity?: string | number | null;
  account_source?: string | null;
}): RailRowVM {
  const qty = Math.max(1, parseInt(String(row.quantity || '1'), 10) || 1);
  const platform = row.account_source ? sourcePlatformLabel(row.account_source) : null;
  return {
    eyebrow: (
      <span className="block truncate font-semibold uppercase tracking-widest text-text-faint">
        #{row.order_id}
        {platform ? ` · ${platform}` : ''}
      </span>
    ),
    title: row.product_title || row.sku || `#${row.order_id}`,
    titleAttr: row.product_title || undefined,
    meta: (
      <span className="block truncate font-semibold uppercase tracking-widest text-text-soft">
        {row.sku || '—'} · {qty}
      </span>
    ),
  };
}

const getPrintedActivityAt = (row: ShippedOrder) =>
  row.label_printed_at ?? row.packed_at ?? row.created_at ?? '';
const getShipOutActivityAt = (row: RecentShipOutRow) =>
  row.ship_confirmed_at ?? row.created_at;

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

  const shippedFetch = useCallback(async (): Promise<RecentShipOutRow[]> => {
    const res = await fetch('/api/orders/recent?staff=1&days=14', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { orders?: RecentShipOutRow[] };
    return (data.orders ?? [])
      .filter((r) => r.ship_confirmed_at || r.is_shipped)
      .slice(0, RAIL_LIMIT);
  }, []);

  const printedQueryKey = useMemo(() => ['labels-rail', 'printed'] as const, []);
  const shippedQueryKey = useMemo(() => ['labels-rail', 'shipped'] as const, []);

  return (
    <div className="flex min-h-0 flex-col">
      <SidebarRecentRailBase<ShippedOrder>
        queryKey={printedQueryKey}
        fetchFn={printedFetch}
        refreshEvents={['app-refresh-data']}
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
      <SidebarRecentRailBase<RecentShipOutRow>
        queryKey={shippedQueryKey}
        fetchFn={shippedFetch}
        refreshEvents={['app-refresh-data']}
        selectedId={open}
        limit={RAIL_LIMIT}
        eyebrowTitle="Recently shipped"
        eyebrowSuffix="You"
        emptyText="No ship-outs yet"
        getId={(row) => Number(row.id)}
        getActivityAt={getShipOutActivityAt}
        onSelect={(row) => openOrder(Number(row.id))}
        getStatusDot={() => 'bg-blue-500'}
        getStatusDotLabel={() => 'Shipped out at the dock'}
        renderRowMain={(row) => <RailRowBody className="flex-1" vm={orderRowVM(row)} />}
      />
    </div>
  );
}
