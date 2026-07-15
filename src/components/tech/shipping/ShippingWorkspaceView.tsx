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
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { useShippingWorkspaceTab } from '@/hooks/useShippingWorkspaceTab';

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
    <DashboardScrollShell
      className="h-full"
      // Pinned chrome (outside the scroll port) is the one top bar; the KPI
      // strip in the body scrolls away and day headers dock at top-0 beneath
      // the chrome. Mirrors DashboardOrdersView's two-zone shell.
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <ShippingWorkspaceHeader
            tab={shipTab}
            onSelectTab={setShipTab}
            controlsSlotRef={setControlsEl}
          />
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
        <div className="mb-4">
          <ShippingKpiStrip
            mode={shipTab}
            techId={Number.isFinite(parsedTechId) ? parsedTechId : undefined}
          />
        </div>

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
                staffScope="url-or-self"
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
