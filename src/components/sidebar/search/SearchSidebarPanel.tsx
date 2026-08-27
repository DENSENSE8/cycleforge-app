'use client';

/**
 * `/search` context rail — recent finds the operator opened, filterable in place.
 *
 * Zone 1 of the Search & Details station. The band filters the rail beneath it;
 * new searches commit only from {@link GlobalHeaderSearch}. Row click (or
 * auto-select of the most recent row when `?sel=` is empty) sets `?sel=` via
 * the optimistic page hook so the centre swaps without a reload.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanBandShell } from '@/components/station/scan-bar';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { ReceivingFeedRail } from '@/components/sidebar/receiving/ReceivingFeedRail';
import { filterReceivingRailRows } from '@/components/sidebar/tech/filter-receiving-rail-rows';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useAuth } from '@/contexts/AuthContext';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';

export function SearchSidebarPanel() {
  const queryClient = useQueryClient();
  const { sel, setSel } = useSearchSelParam();
  const { user } = useAuth();
  const staffIdNum = user?.staffId ?? 0;
  const { theme: themeColor } = useStationTheme({ staffId: staffIdNum });
  const [railFilter, setRailFilter] = useState('');

  const railQueryKey = useMemo(
    () => receivingRailQueryKey('search-recent', undefined, '', null),
    [],
  );

  const railRows = useQuery<ReceivingLineRow[]>({
    queryKey: railQueryKey,
    queryFn: skipToken,
    notifyOnChangeProps: ['data'],
  }).data;

  const selectedLineId = useMemo(() => {
    if (sel?.entityType !== 'receiving') return null;
    const rows = railRows ?? queryClient.getQueryData<ReceivingLineRow[]>(railQueryKey);
    const match = rows?.find((row) => Number(row.receiving_id) === sel.id);
    return match?.id ?? null;
  }, [sel, railRows, queryClient, railQueryKey]);

  useEffect(() => {
    const onSelectLine = (event: Event) => {
      const detail = (event as CustomEvent<ReceivingLineRow | { row: ReceivingLineRow } | null>)
        .detail;
      const row =
        detail && typeof detail === 'object' && 'row' in detail
          ? (detail as { row: ReceivingLineRow | null }).row
          : (detail as ReceivingLineRow | null);
      if (!row) return;
      const receivingId = Number(row.receiving_id);
      if (!Number.isFinite(receivingId) || receivingId <= 0) return;
      setSel({ entityType: 'receiving', id: receivingId });
    };
    window.addEventListener('receiving-select-line', onSelectLine);
    return () => window.removeEventListener('receiving-select-line', onSelectLine);
  }, [setSel]);

  const includeRow = useCallback(
    (row: ReceivingLineRow) => filterReceivingRailRows([row], railFilter).length > 0,
    [railFilter],
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-surface-card"
      data-testid="search-sidebar-panel"
    >
      <ScanBandShell themeColor={themeColor}>
        <TechRailSearchBar
          variant="chrome"
          flush
          value={railFilter}
          onChange={setRailFilter}
          placeholder="Filter recent finds…"
          className="min-w-0 flex-1"
          data-testid="search-rail-find"
        />
      </ScanBandShell>
      <SidebarRailScrollport>
        <ReceivingFeedRail
          key="rail-search-recent"
          feed="searchRecent"
          selectedLineId={selectedLineId}
          includeRow={includeRow}
          emptyText={railFilter.trim() ? 'No recent finds match' : 'No recent finds'}
        />
      </SidebarRailScrollport>
    </div>
  );
}
