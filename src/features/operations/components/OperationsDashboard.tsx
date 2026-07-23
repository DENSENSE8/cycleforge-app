'use client';

import { useState } from 'react';
import { LiveFeedCard } from './LiveFeedCard';
import { ExceptionsRow } from './ExceptionsRow';
import { PipelineRow } from './PipelineRow';
import { SecondaryKPITiles } from './SecondaryKPITiles';
import { KpiDetailsModal, type KpiKind } from './KpiDetailsModal';
import { PrimaryKpiGrid } from './PrimaryKpiGrid';
import { OperationsGoalHero } from './OperationsGoalHero';
import { OperationsSectionHeader as SectionHeader } from './OperationsSectionHeader';
import { useOperationsDashboardData } from './useOperationsDashboardData';
import { selectKpiValue } from './operations-dashboard-logic';

/**
 * Operations Live — a **Monitor** (observe-only): goal → KPIs → exceptions →
 * pipeline → feed, and every click leaves to a workbench. The demoted sections
 * (Agents, StaffGoals, Inventory, Velocity, Matrix/PerformanceGoals, Support)
 * and the Pending grid order ledger were unmounted from Live — a ledger
 * is a Workbench (durable selection + edit), the wrong archetype on a Monitor.
 * Those components still exist for the Analytics mode; Live stops consuming them.
 * The out-of-stock KPI tile is the deep-link into the Orders workbench.
 */
export function OperationsDashboard() {
  const [openKpi, setOpenKpi] = useState<KpiKind | null>(null);
  const { data, isLoading } = useOperationsDashboardData();

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-surface-canvas text-text-default">
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16 space-y-6">

        {/* ── TOP: the current goal (P3-ADM-01 acceptance A — goal-first) ── */}
        <OperationsGoalHero staffProgress={data?.staffProgress} isLoading={isLoading} />

        {/* ── KPIs: today's snapshot ── */}
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

        {/* ── Exceptions: what needs attention ── */}
        <section>
          <ExceptionsRow />
        </section>

        {/* ── Pipeline: where work is stacked ── */}
        <section>
          <PipelineRow />
        </section>

        {/* ── Feed: the live activity stream ── */}
        <section>
          <LiveFeedCard
            feed={data?.activityFeed}
            isLoading={isLoading}
            ablyStatus="connected"
          />
        </section>
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
