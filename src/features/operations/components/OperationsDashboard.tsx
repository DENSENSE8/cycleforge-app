'use client';

import { useState } from 'react';
import { LiveFeedCard } from './LiveFeedCard';
import { PipelineRow } from './PipelineRow';
import { SecondaryKPITiles } from './SecondaryKPITiles';
import { KpiDetailsModal, type KpiKind } from './KpiDetailsModal';
import { PrimaryKpiGrid } from './PrimaryKpiGrid';
import { OperationsGoalHero } from './OperationsGoalHero';
import { OperationsSectionHeader as SectionHeader } from './OperationsSectionHeader';
import { useOperationsDashboardData } from './useOperationsDashboardData';
import { realtimeLinkToAblyStatus } from './operations-live-status';
import { useRealtimeLink } from '@/hooks/useConnectionHealth';
import { GridDegradedBox } from '@/design-system/components/grid';
import { selectKpiValue } from './operations-dashboard-logic';

/** Operations Live — a **Monitor** (observe-only): */
export function OperationsDashboard() {
  const [openKpi, setOpenKpi] = useState<KpiKind | null>(null);
  const { data, isLoading, isError, refetch } = useOperationsDashboardData();
  // Honest realtime — derive the Live pill from the shared connection store,
  // never a hardcoded literal (H1 Phase A). Same source as the Ops TV pill.
  const realtimeLink = useRealtimeLink();
  // Incoming pattern: degraded replaces empty — do not paint zero KPI tiles that
  // read as a quiet warehouse under a failed snapshot with no cache.
  const snapshotEmpty = isError && !data;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-surface-canvas text-text-default">
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16 space-y-6">

        {/* Degraded band (fourth settled state) — the snapshot fetch failed. */}
        {isError ? (
          <div className="py-2">
            <GridDegradedBox
              message="Couldn't load the operations snapshot."
              onRetry={() => {
                void refetch();
              }}
            />
          </div>
        ) : null}

        {/* ── TOP: the current goal (P3-ADM-01 acceptance A — goal-first) ── */}
        <OperationsGoalHero staffProgress={data?.staffProgress} isLoading={isLoading && !snapshotEmpty} />

        {/* ── KPIs: today's snapshot ── */}
        {!snapshotEmpty ? (
          <section>
            <SectionHeader
              eyebrow="Today’s snapshot"
              title="Numbers at a glance"
              meta="Live · refreshes every minute"
            />
            <PrimaryKpiGrid summary={data?.summary} onOpen={setOpenKpi} activeKind={openKpi} />

            <div className="mt-3">
              <SecondaryKPITiles summary={data?.summary} />
            </div>
          </section>
        ) : null}

        {/* ── Pipeline: where work is stacked ── */}
        <section>
          <PipelineRow />
        </section>

        {/* ── Feed: the live activity stream ── */}
        {!snapshotEmpty ? (
          <section>
            <LiveFeedCard
              feed={data?.activityFeed}
              isLoading={isLoading}
              ablyStatus={realtimeLinkToAblyStatus(realtimeLink)}
            />
          </section>
        ) : null}
      </main>

      <KpiDetailsModal
        kind={openKpi}
        value={selectKpiValue(openKpi, data?.summary)}
        activityFeed={data?.activityFeed}
        onClose={() => setOpenKpi(null)}
      />
    </div>
  );
}
