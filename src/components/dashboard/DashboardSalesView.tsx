'use client';

/**
 * Dashboard · Sales — front-desk transaction history (Sales · Local Pickup).
 *
 * Sibling of the Inbound desk Docked lane: same permission-gate recipe, but
 * the region body is the existing {@link WalkInHistoryHub} (chrome + feeds) —
 * do not fork a second transaction feed. Wire values `?mode=sales` |
 * `?mode=pickup` both land here (`getDashboardDomainFromSearch` → `sales`).
 *
 * Counter intake stays on `/pickup` + `/repair`; the sidebar station hand-offs
 * live in {@link WalkInHistorySidebar} via the dashboard context panel.
 */

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WalkInHistoryHub } from '@/components/walk-in/WalkInHistoryHub';
import { useAuth } from '@/contexts/AuthContext';
import { DASHBOARD_SALES_PERMISSION } from '@/lib/dashboard/dashboard-domains';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

export function DashboardSalesView() {
  const router = useRouter();
  useRealtimeInvalidation({ repair: true, walkIn: true });

  // Domain-level gate: the page is `dashboard.view`, but this domain shows
  // walk-in history, so it carries walk_in's own permission.
  //
  // **A domain the operator can't see is ABSENT, not disabled** (dashboard IA
  // rework C10 / inbound precedent). The L2 pills are already gone for them
  // (`requires` on Sales / Local Pickup in `SIDEBAR_PAGE_NAV`); a bookmark or
  // hand-typed `?mode=sales` falls back to the dashboard they DO have.
  const { has, isLoaded } = useAuth();
  const denied = isLoaded && !has(DASHBOARD_SALES_PERMISSION);
  useEffect(() => {
    if (denied) router.replace('/dashboard');
  }, [denied, router]);
  if (!isLoaded || denied) {
    return <div className="flex min-h-0 flex-1 bg-surface-canvas" aria-busy />;
  }

  return (
    <Suspense fallback={<div className="flex-1 bg-surface-canvas" aria-hidden />}>
      <WalkInHistoryHub />
    </Suspense>
  );
}
