'use client';

import { useSearchParams } from 'next/navigation';
import { DashboardRecentsPanel } from '@/components/sidebar/dashboard/DashboardRecentsPanel';
import { OrderIngestRail } from '@/components/outbound/orders/OrderIngestRail';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';

/** The Dashboard route's context panel — the stable sidebar picker/scope for the dashboard Workbench. */
// TODO(daily-triage F0→F1):
// TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1
export function DashboardOrdersContextPanel() {
  const searchParams = useSearchParams();
  const dashboardSearch = useDashboardSearchController();
  const domain = getDashboardDomainFromSearch(searchParams);

  if (domain === 'inbound') {
    return <DashboardRecentsPanel />;
  }

  if (domain === 'sales') return null;

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
