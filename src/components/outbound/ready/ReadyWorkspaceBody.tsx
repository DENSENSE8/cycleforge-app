'use client';

/**
 * Ready stage body for the FBA inbound workbench — the allocation history
 * grid. Find (`?q=`) and the disposition facet (`?rtab=`) are page chrome in
 * the contextual sidebar (`NAV_PAGE_DECLS.fba.items.ready`); this host only
 * reads them to fetch and narrow the table.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ReadyQueueTable } from '@/components/outbound/ready/ReadyQueueTable';
import { fetchReadyHistory, readyHistoryQueryKey } from '@/components/outbound/ready/ready-history';
import { useReadyWorkspaceTab } from '@/hooks/useReadyWorkspaceTab';
import { readyTabDisposition } from '@/utils/ready-workspace-state';

export function ReadyWorkspaceBody() {
  const q = useSearchParams()?.get('q')?.trim() ?? '';
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
    />
  );
}
