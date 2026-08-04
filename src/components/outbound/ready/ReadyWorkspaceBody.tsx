'use client';

/**
 * Ready stage body for the FBA inbound workbench — KPI disposition chips +
 * allocation history grid. Stage tabs + search live in `FbaWorkspaceHeader`;
 * this component owns only the scroll body.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReadyKpiStrip } from '@/components/outbound/ready/ReadyKpiStrip';
import { ReadyQueueTable } from '@/components/outbound/ready/ReadyQueueTable';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useReadyWorkspaceTab } from '@/hooks/useReadyWorkspaceTab';
import type { AllocationHit } from '@/lib/channel-allocation';
import {
  readyTabDisposition,
  type ReadyWorkspaceCounts,
} from '@/utils/ready-workspace-state';

async function fetchReadyHistory(q: string): Promise<AllocationHit[]> {
  const params = new URLSearchParams({ limit: '500' });
  if (q.trim()) params.set('q', q.trim());
  const response = await fetch(`/api/shipping/ready-queue?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Failed to load recently-tested history');
  const json = (await response.json()) as { hits?: AllocationHit[] };
  return json.hits ?? [];
}

export function ReadyWorkspaceBody() {
  const { q } = useOutboundUrlState();
  const { readyTab, setReadyTab } = useReadyWorkspaceTab();
  const query = useQuery({
    queryKey: ['outbound-ready-history', q],
    queryFn: () => fetchReadyHistory(q),
    staleTime: 15_000,
  });
  const allHits = query.data ?? [];

  const counts = useMemo<ReadyWorkspaceCounts>(() => {
    const next: ReadyWorkspaceCounts = {
      all: allHits.length,
      fba: 0,
      prebox: 0,
      hold: 0,
      staged: 0,
    };
    for (const hit of allHits) {
      if (hit.disposition === 'FBA') next.fba += 1;
      if (hit.disposition === 'PREBOX_STOCK') next.prebox += 1;
      if (hit.disposition === 'HOLD') next.hold += 1;
      if (hit.allocationState === 'FBA_STAGED') next.staged += 1;
    }
    return next;
  }, [allHits]);

  const visibleHits = useMemo(() => {
    const disposition = readyTabDisposition(readyTab);
    return disposition
      ? allHits.filter((hit) => hit.disposition === disposition)
      : allHits;
  }, [allHits, readyTab]);

  return (
    <>
      <div className="mb-4">
        <ReadyKpiStrip
          counts={counts}
          activeTab={readyTab}
          onSelectTab={setReadyTab}
        />
      </div>

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
    </>
  );
}
