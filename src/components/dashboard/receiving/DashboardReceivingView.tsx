'use client';

/**
 * Dashboard · Receiving — the inbound-cartons region under two table tabs
 * (Triage · Unbox). Sibling of {@link DashboardInboundView}: same
 * `DashboardScrollShell` + `ReceivingLinesTable` recipe, framed as the
 * scanned-order / unboxed-order tabs the Receiving mode requested, each with its
 * own KPI band.
 *
 * `ReceivingLinesTable` reads its own mode from the URL (`resolveLiveReceivingMode`
 * → `history` on `/dashboard?mode=inbound`) and its order axis from `?sort=`
 * (Triage = `scanned_newest`, Unbox = `unboxed_newest`), so the tab strip and the
 * table stay in lockstep. The table self-scrolls inside its own `WorkbenchTablePane`,
 * so the shell body is `overflow-y-hidden` and the pinned chrome carries the
 * header + the per-tab KPI band (the Incoming surface pins its KPI the same way).
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { DashboardReceivingHeader } from '@/components/dashboard/receiving/DashboardReceivingHeader';
import { DashboardReceivingKpiStrip } from '@/components/dashboard/receiving/DashboardReceivingKpiStrip';
import { dashboardReceivingTabFromSort } from '@/components/dashboard/receiving/dashboard-receiving-tabs';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { WORKBENCH_CHROME_COLUMN } from '@/components/dashboard/workbench-shell';
import { EmptyState } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { DASHBOARD_INBOUND_PERMISSION } from '@/lib/dashboard/dashboard-domains';

// Code-split like the inbound table — the chunk loads only when an operator
// opens the Receiving mode (mirrors the deferred order views).
const ReceivingLinesTable = dynamic(() => import('@/components/station/ReceivingLinesTable'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-surface-canvas" aria-hidden />,
});

export function DashboardReceivingView() {
  const searchParams = useSearchParams();
  const tab = dashboardReceivingTabFromSort(searchParams.get('sort'));

  // Mode-level gate: the page is `dashboard.view`, but this mode shows receiving
  // data, so it carries receiving's own permission (mirrors DashboardInboundView).
  const { has, isLoaded } = useAuth();
  if (!isLoaded) return <div className="flex min-h-0 flex-1 bg-surface-canvas" aria-busy />;
  if (!has(DASHBOARD_INBOUND_PERMISSION)) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-surface-canvas p-6">
        <EmptyState
          title="No access to Receiving"
          description="You need the “View receiving” permission to see inbound carton history."
        />
      </div>
    );
  }

  return (
    <DashboardScrollShell
      className="overflow-y-hidden"
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <DashboardReceivingHeader />
          <div className="pt-3">
            <DashboardReceivingKpiStrip tab={tab} />
          </div>
        </div>
      }
    >
      <Suspense fallback={<div className="flex-1 bg-surface-canvas" aria-hidden />}>
        <ReceivingLinesTable />
      </Suspense>
    </DashboardScrollShell>
  );
}
