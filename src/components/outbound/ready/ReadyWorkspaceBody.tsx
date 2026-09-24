'use client';

/**
 * Ready stage body for the FBA inbound workbench — the allocation history grid.
 *
 * It resolves the feed and hands the table its find field as DATA; the table
 * draws it. Nothing here is chrome.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReadyQueueTable } from '@/components/outbound/ready/ReadyQueueTable';
import { fetchReadyHistory, readyHistoryQueryKey } from '@/components/outbound/ready/ready-history';
import type { DataTableFilterOption } from '@/components/tables/DataTable';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useReadyWorkspaceTab } from '@/hooks/useReadyWorkspaceTab';
import { readyTabDisposition } from '@/utils/ready-workspace-state';

export function ReadyWorkspaceBody({
  modeFilter,
}: {
  /** The FBA desk's mode options — threaded into the table's ONE filter. */
  modeFilter?: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
}) {
  const { q, setQ } = useOutboundUrlState();
  const { readyTab } = useReadyWorkspaceTab();
  const query = useQuery({
    queryKey: readyHistoryQueryKey(q),
    queryFn: () => fetchReadyHistory(q),
    staleTime: 15_000,
  });
  const allHits = query.data ?? [];

  const visibleHits = useMemo(() => {
    const disposition = readyTabDisposition(readyTab);
    return disposition
      ? allHits.filter((hit) => hit.disposition === disposition)
      : allHits;
  }, [allHits, readyTab]);

  return (
    <ReadyQueueTable
      hits={visibleHits}
      isLoading={query.isLoading}
      isError={query.isError}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
      // Both refinements narrow the list, so both must flip the empty answer
      // from "nothing tested yet" to "nothing matches this view".
      isFiltered={Boolean(q.trim()) || readyTab !== 'all'}
      // `q` rides the fetch key (line 32); `/api/shipping/ready-queue` answers
      // it over title/sku/fnsku/asin/serial/unit_uid (ready-queue.ts:94) inside
      // a 500-row window. ASIN and unit UID are not mounted tracks, so any
      // in-memory re-run of this match could only lose those hits — the
      // declaration is what keeps the engine from ever adding that second pass.
      // `pending` is the live half: without it a background refetch paints the
      // PREVIOUS answer as though it answered the text now in the box.
      search={{
        value: q,
        onChange: setQ,
        placeholder: 'Filter tested units…',
        answeredBy: 'server',
        pending: query.isFetching,
      }}
      filter={modeFilter}
    />
  );
}
