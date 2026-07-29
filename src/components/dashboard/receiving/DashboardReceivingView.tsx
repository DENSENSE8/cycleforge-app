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

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardReceivingHeader } from '@/components/dashboard/receiving/DashboardReceivingHeader';
import { DashboardReceivingKpiStrip } from '@/components/dashboard/receiving/DashboardReceivingKpiStrip';
import { DashboardAttentionStrip } from '@/components/dashboard/DashboardAttentionStrip';
import { dashboardReceivingTabFromSort } from '@/components/dashboard/receiving/dashboard-receiving-tabs';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { WORKBENCH_CHROME_COLUMN } from '@/components/dashboard/workbench-shell';
import { useAuth } from '@/contexts/AuthContext';
import { DASHBOARD_INBOUND_PERMISSION } from '@/lib/dashboard/dashboard-domains';

// Code-split like the inbound table — the chunk loads only when an operator
// opens the Receiving mode (mirrors the deferred order views).
const ReceivingLinesTable = dynamic(() => import('@/components/station/ReceivingLinesTable'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-surface-canvas" aria-hidden />,
});

export function DashboardReceivingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = dashboardReceivingTabFromSort(searchParams.get('sort'));

  // Domain-level gate: the page is `dashboard.view`, but this domain shows
  // receiving data, so it carries receiving's own permission.
  //
  // **A domain the operator can't see is ABSENT, not disabled** (dashboard IA
  // rework C10). The L2 pill is already gone for them (`requires` on the
  // Receiving mode in `SIDEBAR_PAGE_NAV`); the only way to arrive here is a
  // bookmark or a hand-typed `?mode=inbound`, and the honest answer to that is
  // the dashboard they DO have — not a denial page that teaches them a surface
  // exists and then refuses it. The gate itself stays: the pill being hidden is
  // navigation, never authorization.
  const { has, isLoaded } = useAuth();
  const denied = isLoaded && !has(DASHBOARD_INBOUND_PERMISSION);
  useEffect(() => {
    if (denied) router.replace('/dashboard');
  }, [denied, router]);
  if (!isLoaded || denied) {
    return <div className="flex min-h-0 flex-1 bg-surface-canvas" aria-busy />;
  }

  return (
    <DashboardScrollShell
      className="overflow-y-hidden"
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <DashboardReceivingHeader />
          {/* Zone A rides in the CHROME slot here, not the body: this shell's
              body is `overflow-y-hidden` because the lines table self-scrolls,
              so there is no scroll port for a band to scroll away in. Still one
              pinned layer — chrome is a non-scrolling sibling, not a second
              sticky. */}
          <div className="space-y-3 pt-3">
            <DashboardAttentionStrip domain="inbound" />
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
