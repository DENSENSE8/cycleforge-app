'use client';

/**
 * Products Labels sidebar rail — "Printed" (recent unit-label issues).
 * Composes `SidebarRecentRailBase` / `RailRowBody` (Unbox / outbound Labels
 * recent-rail contract). Selecting a row opens unit detail via
 * `?labelsView=recent&historyId=`.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { recentLookupKey } from '@/components/labels/recent-lookup-key';
import {
  getLabelPrintStatusDot,
  getLabelPrintStatusDotLabel,
  LabelPrintStatusChip,
  labelPrintFeedToRailVM,
} from '@/components/labels/product-labels-rail-vm';
import type { LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';

const PRODUCT_LABELS_RAIL_LIMIT = 12;
const PRODUCT_LABELS_RAIL_REFRESH_EVENTS = ['app-refresh-data', 'labels-print-feed'] as const;

const getActivityAt = (row: LabelPrintFeedItem) => row.printed_at;

async function fetchLabelPrintFeed(limit: number): Promise<LabelPrintFeedItem[]> {
  const res = await fetch(`/api/labels/recent?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load recent label prints');
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items.slice(0, limit) : [];
}

export function ProductLabelsRecentRail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const historyId = searchParams.get('historyId');

  const queryKey = useMemo(
    () => ['labels.recent', PRODUCT_LABELS_RAIL_LIMIT] as const,
    [],
  );

  const fetchFn = useCallback(
    () => fetchLabelPrintFeed(PRODUCT_LABELS_RAIL_LIMIT),
    [],
  );

  // Same cache key as useLabelPrintFeed / the rail shell — selection highlight
  // stays in sync when the feed refreshes after a print.
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchFn,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const selectedId = useMemo(() => {
    if (!historyId) return null;
    const match = items.find((item) => recentLookupKey(item) === historyId);
    return match?.id ?? null;
  }, [historyId, items]);

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
    <SidebarRecentRailBase<LabelPrintFeedItem>
      queryKey={queryKey}
      fetchFn={fetchFn}
      refreshEvents={[...PRODUCT_LABELS_RAIL_REFRESH_EVENTS]}
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
      renderRowMain={(row) => (
        <RailRowBody className="flex-1" vm={labelPrintFeedToRailVM(row)} />
      )}
      renderPopover={(row, { openWorkspace, dismiss }) => (
        <div className="flex flex-col gap-2 p-3 text-role-micro">
          <p className="truncate text-role-caption font-semibold text-text-default">
            {row.product_title || row.sku || 'Untitled'}
          </p>
          {row.sku ? (
            <p className="truncate font-mono text-text-soft">{row.sku}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {row.current_status ? <LabelPrintStatusChip status={row.current_status} /> : null}
            {row.staff_name ? (
              <span className="text-text-faint">{row.staff_name}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="ds-raw-button mt-1 self-start text-role-caption font-semibold text-blue-600 hover:underline"
            onClick={() => {
              openWorkspace();
              dismiss();
            }}
          >
            Open →
          </button>
        </div>
      )}
    />
  );
}
