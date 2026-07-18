'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { ReadyKpiStrip } from '@/components/outbound/ready/ReadyKpiStrip';
import { ReadyQueueTable } from '@/components/outbound/ready/ReadyQueueTable';
import {
  ReadyWorkspaceHeader,
  type ReadyWorkspaceCounts,
} from '@/components/outbound/ready/ReadyWorkspaceHeader';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useReadyWorkspaceTab } from '@/hooks/useReadyWorkspaceTab';
import type { AllocationHit } from '@/lib/channel-allocation';
import { readyTabDisposition } from '@/utils/ready-workspace-state';

async function fetchReadyHistory(q: string): Promise<AllocationHit[]> {
  const params = new URLSearchParams({ limit: '500' });
  if (q.trim()) params.set('q', q.trim());
  const response = await fetch(`/api/outbound/ready-queue?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Failed to load recently-tested history');
  const json = (await response.json()) as { hits?: AllocationHit[] };
  return json.hits ?? [];
}

export function ReadyWorkspaceView() {
  const { q, setQ } = useOutboundUrlState();
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
    <DashboardScrollShell
      className="h-full"
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <ReadyWorkspaceHeader
            tab={readyTab}
            onSelectTab={setReadyTab}
            search={q}
            onSearch={setQ}
            counts={counts}
          />
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
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
        />
      </div>
    </DashboardScrollShell>
  );
}
