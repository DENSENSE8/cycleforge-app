'use client';

/**
 * Shipping mode Workbench on `/test` — sticky KPI strip + unified header
 * (Pending · FBA | History) + tab body. Mirrors DashboardOrdersView chrome
 * while the sidebar keeps Station scan / Up Next I/O.
 */

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { ShippingKpiStrip } from '@/components/tech/shipping/ShippingKpiStrip';
import { ShippingWorkspaceHeader } from '@/components/tech/shipping/ShippingWorkspaceHeader';
import { useShippingWorkspaceTab } from '@/hooks/useShippingWorkspaceTab';
import { cn } from '@/utils/_cn';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

const FBAShipmentsTable = dynamic(() => import('@/components/dashboard/FBAShipmentsTable'), {
  ssr: false,
  loading: TableFallback,
});

const TechTable = dynamic(
  () => import('@/components/TechTable').then((m) => m.TechTable),
  { ssr: false, loading: TableFallback },
);

export interface ShippingWorkspaceViewProps {
  /** Signed-in tech id — used as History fallback when staff filter is set to Me via URL. */
  techId: string;
}

export function ShippingWorkspaceView({ techId }: ShippingWorkspaceViewProps) {
  const { shipTab, setShipTab } = useShippingWorkspaceTab();
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
  const parsedTechId = parseInt(techId, 10);

  return (
    <DashboardScrollShell className="h-full">
      <div className="relative mx-auto flex w-full max-w-[1440px] min-w-0 flex-col px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <div
          className={cn(
            'sticky top-0 z-header -mx-4 mb-4 bg-surface-canvas/95 px-4 pb-1 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
          )}
        >
          <ShippingKpiStrip mode={shipTab} />
        </div>

        <ShippingWorkspaceHeader
          tab={shipTab}
          onSelectTab={setShipTab}
          controlsSlotRef={setControlsEl}
          className="sticky top-[var(--dashboard-kpi-height,72px)] z-header mb-3 bg-surface-canvas/95 backdrop-blur-sm"
        />

        <div className="relative flex min-w-0 flex-col">
          <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
            {shipTab === 'fba' ? (
              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-role-caption text-text-soft">
                  Recommended FBA to ship — work in progress. Use the FBA station for plan, label, and
                  hand-off.
                </p>
                <FBAShipmentsTable />
              </div>
            ) : shipTab === 'history' ? (
              <TechTable
                testedBy={Number.isFinite(parsedTechId) ? parsedTechId : 0}
                staffScope="url"
                toolbarPortalTarget={controlsEl}
              />
            ) : (
              <UnshippedTable
                strictSearchScope
                toolbarPortalTarget={controlsEl}
              />
            )}
          </Suspense>
        </div>
      </div>
    </DashboardScrollShell>
  );
}
