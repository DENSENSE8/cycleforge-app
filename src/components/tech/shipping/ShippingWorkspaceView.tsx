'use client';

/**
 * Shipping mode Workbench on `/test` — the three-band Sheets flush stack via
 * {@link WorkbenchSheetView}. Sidebar keeps Station scan / Up Next I/O.
 *
 * Multi-select opens the order right-rail plane (History / dashboard SoT) —
 * no bottom ContextualSelectionBar capsule.
 */

import dynamic from 'next/dynamic';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import {
  WorkbenchSheetFallback,
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { ShippingKpiStrip } from '@/components/tech/shipping/ShippingKpiStrip';
import {
  ShippingTriageBand,
  ShippingWorkspaceHeader,
} from '@/components/tech/shipping/ShippingWorkspaceHeader';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { WORKBENCH_KPI_SURFACE } from '@/components/dashboard/workbench-kpi-collapse';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useShippingWorkspaceTab } from '@/hooks/useShippingWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';

const TechTable = dynamic(
  () => import('@/components/TechTable').then((m) => m.TechTable),
  // SSR allowed — shipping history is not `/test` LCP (Testing centre is).
  // Loading fallback is the stand-in while the chunk resolves.
  { loading: WorkbenchSheetFallback },
);

export interface ShippingWorkspaceViewProps {
  /** Signed-in tech id — used as History fallback when staff filter is set to Me via URL. */
  techId: string;
}

export function ShippingWorkspaceView({ techId }: ShippingWorkspaceViewProps) {
  const { shipTab, setShipTab } = useShippingWorkspaceTab();
  const { newOpen, openNew, closeNew } = useNewOrderParam();
  const chrome = useWorkbenchSheetChrome(WORKBENCH_KPI_SURFACE.shipping);
  const parsedTechId = parseInt(techId, 10);
  const queueTab = shipTab === 'pending' || shipTab === 'urgent';
  // Pending / Urgent reuse the dashboard To Ship selection scope + rail actions.
  const { selectionEnabled, selectMode, selectionOverlays } = useOrderRailSelection(
    'unshipped',
    { publish: queueTab },
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <WorkbenchSheetView
        chrome={chrome}
        className="h-full bg-transparent"
        swapKey={shipTab}
        tabs={({ className }) => (
          <ShippingWorkspaceHeader
            tab={shipTab}
            onSelectTab={setShipTab}
            onNewOrder={openNew}
            className={className}
          />
        )}
        kpi={
          <ShippingKpiStrip
            mode={shipTab}
            techId={Number.isFinite(parsedTechId) ? parsedTechId : undefined}
          />
        }
        triage={(p) => <ShippingTriageBand tab={shipTab} {...p} />}
        overlays={
          queueTab && selectionEnabled ? (
            <>
              <OrderRailCompare />
              <OrderRailShell />
              {selectionOverlays}
            </>
          ) : null
        }
      >
        {({ controlsEl }) =>
          shipTab === 'history' ? (
            <TechTable
              testedBy={Number.isFinite(parsedTechId) ? parsedTechId : 0}
              staffScope="url-or-self"
              toolbarPortalTarget={controlsEl}
            />
          ) : shipTab === 'all' ? (
            <TechAllTriageTable scope="shipping" columnTriggerPortalTarget={null} />
          ) : (
            <UnshippedTable
              strictSearchScope
              selectMode={selectMode}
              railSelection
              toolbarPortalTarget={controlsEl}
            />
          )
        }
      </WorkbenchSheetView>
      <NewOrderEntryOverlay open={newOpen} onClose={closeNew} />
    </div>
  );
}
