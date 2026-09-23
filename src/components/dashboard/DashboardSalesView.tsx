'use client';

/**
 * Dashboard · Sales — front-desk history (Sales · Local Pickup · Repairs).
 *
 * Sibling of the Inbound desk Docked lane: same permission-gate recipe, but
 * the region body is the existing {@link WalkInHistoryHub} (chrome + feeds /
 * RepairTable) — do not fork a second transaction feed. Wire values
 * `?mode=sales` | `?mode=pickup` | `?mode=repairs` all land here
 * (`getDashboardDomainFromSearch` → `sales`).
 *
 * Counter intake stays on `/pickup` + `/repair`; Repairs is the history door
 * onto the shared RepairTable. Sales/Pickup use `WalkInHistorySidebar`; Repair
 * Service is table-only and has no Favorites sidebar.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WalkInHistoryHub } from '@/components/walk-in/WalkInHistoryHub';
import { useAuth } from '@/contexts/AuthContext';
import {
  DASHBOARD_SALES_MODE,
  DASHBOARD_SALES_PERMISSION,
  isDashboardRepairsMode,
} from '@/lib/dashboard/dashboard-domains';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

function DashboardSalesViewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useRealtimeInvalidation({ repair: true, walkIn: true });

  // Domain-level gate: the page is `dashboard.view`, but this domain shows
  // walk-in history, so it carries walk_in's own permission.
  //
  // **A domain the operator can't see is ABSENT, not disabled** (dashboard IA
  // rework C10 / inbound precedent). The L2 pills are already gone for them
  // (`requires` on Sales / Local Pickup / Repairs in `SIDEBAR_PAGE_NAV`); a
  // bookmark or hand-typed `?mode=sales` falls back to the dashboard they DO
  // have. Repairs additionally needs `repair.view` — bounce to Sales Board.
  const { has, isLoaded } = useAuth();
  const repairsMode = isDashboardRepairsMode(searchParams);
  // Sales/Pickup feeds need walk_in.view. Repairs is gated by repair.view
  // alone (matches the L2 child's `requires`) so a repair operator without
  // front-desk history access can still open the history desk.
  const deniedWalkIn =
    isLoaded && !repairsMode && !has(DASHBOARD_SALES_PERMISSION);
  const deniedRepairs = isLoaded && repairsMode && !has('repair.view');

  useEffect(() => {
    if (deniedWalkIn) {
      router.replace('/dashboard');
      return;
    }
    if (deniedRepairs) {
      router.replace(`/dashboard?mode=${DASHBOARD_SALES_MODE}`);
    }
  }, [deniedWalkIn, deniedRepairs, router]);

  if (!isLoaded || deniedWalkIn || deniedRepairs) {
    return <div className="flex min-h-0 flex-1 bg-surface-canvas" aria-busy />;
  }

  return <WalkInHistoryHub />;
}

export function DashboardSalesView() {
  return (
    <Suspense fallback={<div className="flex-1 bg-surface-canvas" aria-hidden />}>
      <DashboardSalesViewInner />
    </Suspense>
  );
}
