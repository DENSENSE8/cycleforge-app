'use client';

/**
 * Products Labels sidebar rail — "Printed" (recent unit-label issues).
 * Composes `SidebarRecentRailBase` / `RailRowBody` (Unbox / outbound Labels
 * recent-rail contract). Selecting a row opens unit detail via
 * `?labelsView=recent&historyId=`. Footer: TechRailSearchBar + status facets.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailPeekCard } from '@/components/sidebar/rail-shell/RailPeekCard';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { railRelativeTime } from '@/components/sidebar/SidebarRailShell';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import {
  EMPTY_LABEL_PRINT_RAIL_FACETS,
  LabelPrintRailFilters,
  matchesLabelPrintRailFacets,
  type LabelPrintRailFacets,
} from '@/components/sidebar/rail-shell/LabelPrintRailFilters';
import { recentLookupKey } from '@/components/labels/recent-lookup-key';
import {
  getLabelPrintStatusDot,
  getLabelPrintStatusDotLabel,
  labelPrintFeedToRailVM,
} from '@/components/labels/product-labels-rail-vm';
import type { LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';
import type { RefreshDomain } from '@/lib/refresh/domains';

const PRODUCT_LABELS_RAIL_LIMIT = 12;
const PRODUCT_LABELS_RAIL_REFRESH_EVENTS = ['labels-print-feed'] as const;
const PRODUCT_LABELS_RAIL_REFRESH_DOMAINS = ['orders.outbound'] as const satisfies readonly RefreshDomain[];

const getActivityAt = (row: LabelPrintFeedItem) => row.printed_at;

async function fetchLabelPrintFeed(limit: number): Promise<LabelPrintFeedItem[]> {
  const res = await fetch(`/api/labels/recent?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load recent label prints');
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items.slice(0, limit) : [];
}

function filterLabelPrintRows(
  rows: LabelPrintFeedItem[],
  query: string,
  facets: LabelPrintRailFacets,
): LabelPrintFeedItem[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (!matchesLabelPrintRailFacets(row, facets)) return false;
    if (!q) return true;
    const hay = [
      row.product_title,
      row.sku,
      row.serial_number,
      row.gtin,
      row.staff_name,
      row.current_status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function ProductLabelsRecentRail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const historyId = searchParams.get('historyId');
  const [filterText, setFilterText] = useState('');
  const [facets, setFacets] = useState<LabelPrintRailFacets>(EMPTY_LABEL_PRINT_RAIL_FACETS);

  const queryKey = useMemo(
    () => ['labels.recent', PRODUCT_LABELS_RAIL_LIMIT] as const,
    [],
  );

  const fetchAll = useCallback(
    () => fetchLabelPrintFeed(PRODUCT_LABELS_RAIL_LIMIT),
    [],
  );

  // Same cache key as useLabelPrintFeed / the rail shell — selection highlight
  // stays in sync when the feed refreshes after a print.
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchAll,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const filteredItems = useMemo(
    () => filterLabelPrintRows(items, filterText, facets),
    [items, filterText, facets],
  );

  const filteredVersion = useMemo(
    () => filteredItems.map((row) => row.id).join('|'),
    [filteredItems],
  );

  const railQueryKey = useMemo(
    () => ['labels.recent.rail', PRODUCT_LABELS_RAIL_LIMIT, filterText, facets.status, filteredVersion] as const,
    [filterText, facets.status, filteredVersion],
  );

  const fetchFn = useCallback(async () => filteredItems, [filteredItems]);

  const selectedId = useMemo(() => {
    if (!historyId) return null;
    const match = filteredItems.find((item) => recentLookupKey(item) === historyId);
    return match?.id ?? null;
  }, [historyId, filteredItems]);

  const selectItem = useCallback(
    (item: LabelPrintFeedItem) => {
      const key = recentLookupKey(item);
      if (!key) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', 'labels');
      params.set('labelsView', 'recent');
      params.set('historyId', key);
      params.delete('q');
      router.replace(`/products?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarRailScrollport>
        <SidebarRecentRailBase<LabelPrintFeedItem>
          queryKey={railQueryKey}
          fetchFn={fetchFn}
          refreshEvents={[...PRODUCT_LABELS_RAIL_REFRESH_EVENTS]}
          refreshDomains={PRODUCT_LABELS_RAIL_REFRESH_DOMAINS}
          selectedId={selectedId}
          limit={PRODUCT_LABELS_RAIL_LIMIT}
          pinSelectedLead={false}
          preserveServerOrder
          eyebrowTitle="Printed"
          emptyText={isLoading ? 'Loading recent prints…' : 'No recent prints'}
          getId={(row) => row.id}
          getActivityAt={getActivityAt}
          onSelect={selectItem}
          getStatusDot={getLabelPrintStatusDot}
          getStatusDotLabel={getLabelPrintStatusDotLabel}
          getCollapsePinLabel={(row) =>
            row.product_title || row.sku || row.unit_id || 'Untitled'
          }
          getCollapsePinMeta={(row) => {
            const unit = row.unit_id || row.serial_number || row.sku;
            const loc = row.current_location?.trim();
            if (unit && loc) return `${unit} · ${loc}`;
            return unit || loc || null;
          }}
          renderRowMain={(row) => (
            <RailRowBody className="flex-1" vm={labelPrintFeedToRailVM(row)} />
          )}
          renderPopover={(row, { openWorkspace, dismiss }) => (
            <RailPeekCard
              title={row.product_title || row.sku || 'Untitled'}
              statusLabel={getLabelPrintStatusDotLabel(row)}
              statusDotClass={getLabelPrintStatusDot(row)}
              meta={row.staff_name ?? undefined}
              facts={[
                { tone: 'sku', value: row.sku ?? '' },
                { tone: 'serial', value: row.serial_number ?? '' },
                { tone: 'bin', value: row.current_location ?? '' },
              ]}
              age={railRelativeTime(row.printed_at)}
              onOpen={() => {
                openWorkspace();
                dismiss();
              }}
            />
          )}
        />
      </SidebarRailScrollport>
      <TechRailSearchBar
        value={filterText}
        onChange={setFilterText}
        placeholder="Filter printed…"
        trailingSuffix={
          <LabelPrintRailFilters facets={facets} onChange={setFacets} />
        }
      />
    </div>
  );
}
