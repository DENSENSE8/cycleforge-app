'use client';

/**
 * Ready stage body for the FBA inbound workbench — the allocation history grid.
 * Stage tabs + search live in `FbaWorkspaceHeader`; the disposition KPI tiles
 * live in the pinned chrome (`ReadyKpiBand`, Band 2) — this component owns only
 * the scroll body (the sheet grid), never a body KPI island.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReadyQueueTable } from '@/components/outbound/ready/ReadyQueueTable';
import { fetchReadyHistory, readyHistoryQueryKey } from '@/components/outbound/ready/ready-history';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useReadyWorkspaceTab } from '@/hooks/useReadyWorkspaceTab';
import { readyTabDisposition } from '@/utils/ready-workspace-state';

interface ReadyWorkspaceBodyProps {
  /** Portal target for the grid's column-display (▦) trigger (triage band slot). */
  columnTriggerPortalTarget?: HTMLElement | null;
}

export function ReadyWorkspaceBody({
  columnTriggerPortalTarget = null,
}: ReadyWorkspaceBodyProps = {}) {
  const { q } = useOutboundUrlState();
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
      columnTriggerPortalTarget={columnTriggerPortalTarget}
    />
  );
}
