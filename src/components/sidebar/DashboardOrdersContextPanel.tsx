'use client';

import { useSearchParams } from 'next/navigation';
import { DashboardRecentsPanel } from '@/components/sidebar/dashboard/DashboardRecentsPanel';
import { WalkInHistorySidebar } from '@/components/walk-in/WalkInHistorySidebar';
import { OrderIngestRail } from '@/components/outbound/orders/OrderIngestRail';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import {
  getDashboardDomainFromSearch,
  isDashboardRepairsMode,
} from '@/lib/dashboard/dashboard-domains';

/**
 * The Dashboard route's context panel — the stable sidebar picker/scope
 * for the dashboard Workbench.
 *
 * Three domains (`getDashboardDomainFromSearch`), each with a picker:
 *   • outbound — no picker. Bare `/dashboard` redirects to `/shipping/orders`,
 *     whose search · views · focus · saved views live in the master nav.
 *   • inbound  — recents (`DashboardRecentsPanel`)
 *   • sales    — station hand-offs (`WalkInHistorySidebar`); Repairs L2
 *     (`?mode=repairs`) has no context sidebar.
 *
 * Inbound used to `return null` here, so `/dashboard?mode=inbound` reserved a
 * 360px column and painted nothing in it; that void is the bug Phase 1.1 of
 * `docs/todo/dashboard-ia-rework-PLAN.md` closes. Outbound is the order feed
 * alone — no capped recents footer under the picker.
 *
 * New-order intake (`?new=true`) opens the shared detail-stack overlay
 * ({@link OrderIngestRail} at its `manual` leaf) — same rail as `/shipping?new=true`.
 */
// TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1
// (`docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md`) — does the personal
// triage rail replace this picker, sit above it, or toggle with it? Unanswered
// by operators, so F0 mounts the rail on Home Today only and leaves this panel
// exactly as it is.
export function DashboardOrdersContextPanel() {
  const searchParams = useSearchParams();
  const dashboardSearch = useDashboardSearchController();
  const domain = getDashboardDomainFromSearch(searchParams);

  if (domain === 'inbound') {
    return <DashboardRecentsPanel />;
  }

  if (domain === 'sales') {
    // Repair Service is a table-only Sales child. In particular, do not mount
    // the repair Favorites rail here: favorites remain an intake convenience
    // on the dedicated repair station, not a Sales-history sidebar.
    if (isDashboardRepairsMode(searchParams)) {
      return null;
    }
    return <WalkInHistorySidebar />;
  }

  // Outbound: `/dashboard` is a redirect shell onto `/shipping/orders`. Only
  // the `?new=true` intake overlay survives so a legacy intake link still opens.
  return (
    <OrderIngestRail
      open={dashboardSearch.showIntakeForm}
      onClose={dashboardSearch.closeIntakeForm}
      initialLeaf="manual"
    />
  );
}
