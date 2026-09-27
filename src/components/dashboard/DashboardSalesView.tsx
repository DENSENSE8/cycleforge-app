'use client';

/** Dashboard · Sales — front-desk history (Sales · Local Pickup · Repairs). */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WalkInHistoryHub } from '@/components/walk-in/WalkInHistoryHub';
import { useAuth } from '@/contexts/AuthContext';
import {
  DASHBOARD_SALES_MODE,
  DASHBOARD_SALES_PERMISSION,
  isDashboardRepairsMode,
} from '@/lib/dashboard/dashboard-domains';

function DashboardSalesViewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Domain-level gate:
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
