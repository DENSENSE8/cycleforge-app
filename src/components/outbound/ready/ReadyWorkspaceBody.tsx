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
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useReadyWorkspaceTab } from '@/hooks/useReadyWorkspaceTab';
import { readyTabDisposition } from '@/utils/ready-workspace-state';

export function ReadyWorkspaceBody() {
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
      // `q` rides the fetch key (line 32); `/api/shipping/ready-queue` answers it over title/sku/fnsku/asin/serial/unit_uid (ready-queue.ts:94)…
      search={{
        value: q,
        onChange: setQ,
        placeholder: 'Filter tested units…',
        answeredBy: 'server',
        pending: query.isFetching,
      }}
    />
  );
}
