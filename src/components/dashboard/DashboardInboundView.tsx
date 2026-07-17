'use client';

/**
 * The dashboard's inbound region: unified inbound header (carton lifecycle
 * facets · search · filters) over the receiving-lines activity trail.
 *
 * The sibling of {@link DashboardOrdersView} — same `DashboardScrollShell` +
 * `WorkbenchChromeHeader` recipe, a different domain. Rows here are receiving
 * cartons/lines, never outbound orders: the two domains share the shell, not the
 * table (FOH/BOH split, plan 04 — "keep inbound cartons in their own domain
 * switch").
 *
 * `ReceivingLinesTable` reads its own mode from the URL
 * (`resolveLiveReceivingMode` → `history` on `/dashboard?mode=inbound`), so it
 * requests `view=activity` here exactly as it did on `/receiving/history`.
 *
 * It also brings its own `WorkbenchTablePane` (the gutter column + card) and
 * self-scrolls inside it, so the shell's body must NOT add a second scroll port
 * or a second gutter — hence `overflow-y-hidden` and no `WORKBENCH_BODY_COLUMN`
 * here. The chrome slot still owns the one pinned top bar, so the table's
 * day-band headers dock beneath it with no offset math.
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { InboundWorkspaceHeader } from '@/components/dashboard/InboundWorkspaceHeader';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { WORKBENCH_CHROME_COLUMN } from '@/components/dashboard/workbench-shell';
import { EmptyState } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { DASHBOARD_INBOUND_PERMISSION } from '@/lib/dashboard/dashboard-domains';

// The inbound table is a non-default dashboard domain — code-split so its chunk
// loads only when an operator opens the mode (mirrors the deferred order views).
const ReceivingLinesTable = dynamic(() => import('@/components/station/ReceivingLinesTable'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-surface-canvas" aria-hidden />,
});

export function DashboardInboundView() {
  // Mode-level gate: the page is `dashboard.view`, but this mode shows receiving
  // data, so it carries receiving's own permission (plan 04 — Watch-outs).
  // Hold blank until auth loads so a permitted operator never sees a denial flash.
  const { has, isLoaded } = useAuth();
  if (!isLoaded) return <div className="flex min-h-0 flex-1 bg-surface-canvas" aria-busy />;
  if (!has(DASHBOARD_INBOUND_PERMISSION)) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-surface-canvas p-6">
        <EmptyState
          title="No access to Inbound"
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
          <InboundWorkspaceHeader />
        </div>
      }
    >
      <Suspense fallback={<div className="flex-1 bg-surface-canvas" aria-hidden />}>
        <ReceivingLinesTable />
      </Suspense>
    </DashboardScrollShell>
  );
}
