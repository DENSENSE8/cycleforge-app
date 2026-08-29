'use client';

/**
 * Labels-mode sidebar rail — "Labels printed" (staged queue, newest label
 * first). Composes `SidebarRecentRailBase` / `RailRowBody` (never a forked
 * list); selecting a row opens the focused label workspace via `?open=` —
 * the same flow as a Queue-tab row click.
 *
 * Footer: TechRailSearchBar + platform facets (recent-rail filter SoT).
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody, type RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { SearchField } from '@/design-system/primitives/SearchField';
import {
  EMPTY_STATION_HISTORY_RAIL_FACETS,
  matchesStationHistoryRailFacets,
  StationHistoryRailFilters,
  type StationHistoryRailFacets,
} from '@/components/sidebar/rail-shell/StationHistoryRailFilters';
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

function filterPrintedRows(
  rows: ShippedOrder[],
  query: string,
  facets: StationHistoryRailFacets,
): ShippedOrder[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (!matchesStationHistoryRailFacets(row.account_source, facets)) return false;
    if (!q) return true;
    const hay = [
      row.product_title,
      row.sku,
      row.order_id,
      row.account_source,
      row.shipping_tracking_number,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function LabelsRecentRail() {
  const { open, setOpen } = useOutboundUrlState();
  const [filterText, setFilterText] = useState('');
  const [facets, setFacets] = useState<StationHistoryRailFacets>(
    EMPTY_STATION_HISTORY_RAIL_FACETS,
  );

  const openOrder = useCallback(
    (id: number) => setOpen(open === id ? null : id),
    [open, setOpen],
  );

  const allQueryKey = useMemo(() => ['labels-rail', 'printed'] as const, []);

  const fetchAll = useCallback(async (): Promise<ShippedOrder[]> => {
    const rows = await fetchStagedOrdersData({ searchQuery: '' });
    return [...rows]
      .sort(
        (a, b) =>
          (Date.parse(String(getPrintedActivityAt(b))) || 0) -
          (Date.parse(String(getPrintedActivityAt(a))) || 0),
      )
      .slice(0, RAIL_LIMIT);
  }, []);

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: allQueryKey,
    queryFn: fetchAll,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const filteredRows = useMemo(
    () => filterPrintedRows(allRows, filterText, facets),
    [allRows, filterText, facets],
  );

  const filteredVersion = useMemo(
    () => filteredRows.map((row) => row.id).join('|'),
    [filteredRows],
  );

  const railQueryKey = useMemo(
    () => ['labels-rail', 'printed', 'view', filterText, facets.platform, filteredVersion] as const,
    [filterText, facets.platform, filteredVersion],
  );

  const fetchFn = useCallback(async () => filteredRows, [filteredRows]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarRailScrollport>
        <SidebarRecentRailBase<ShippedOrder>
          queryKey={railQueryKey}
          fetchFn={fetchFn}
          refreshDomains={['orders.outbound']}
          selectedId={open}
          limit={RAIL_LIMIT}
          eyebrowTitle="Labels printed"
          emptyText={isLoading ? 'Loading labeled orders…' : 'No labeled orders staged yet'}
          getId={(row) => Number(row.id)}
          getActivityAt={getPrintedActivityAt}
          onSelect={(row) => openOrder(Number(row.id))}
          getStatusDot={() => 'bg-emerald-500'}
          getStatusDotLabel={() => 'Label printed · staged for dock'}
          getCollapsePinLabel={(row) =>
            row.product_title || row.sku || `#${row.order_id}`
          }
          getCollapsePinMeta={(row) => {
            const orderId = String(row.order_id || '').trim();
            const sku = String(row.sku || '').trim();
            if (orderId && sku) return `${orderId} · ${sku}`;
            return orderId || sku || null;
          }}
          getCollapsePinFacts={(row) => [
            {
              tone: 'order',
              value: String(row.order_id || ''),
              platformValue: row.account_source,
            },
            {
              tone: 'tracking',
              value: String(row.shipping_tracking_number || ''),
              carrierHint: row.carrier ?? null,
            },
            { tone: 'sku', value: String(row.sku || '') },
          ]}
          renderRowMain={(row) => <RailRowBody className="flex-1" vm={orderRowVM(row)} />}
        />
      </SidebarRailScrollport>
      <SearchField
        value={filterText}
        onChange={setFilterText}
        placeholder="Filter printed…"
        rightElement={
          <StationHistoryRailFilters facets={facets} onChange={setFacets} />
        }
        />
    </div>
  );
}
