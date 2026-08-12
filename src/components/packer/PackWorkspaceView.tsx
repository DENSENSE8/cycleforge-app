'use client';

/**
 * Pack browse workbench — Queue (TESTED Unshipped SoT) · History (packer logs).
 * Sheets flush chrome (Unbox recipe): tabs · KPI · triage in one pinned
 * sheet-chrome stack; body is WORKBENCH_SHEET_HOST. Band 2 uses Unbox SoT
 * {@link WorkbenchKpiBand} (snap-collapse).
 *
 * Multi-select opens the order right-rail plane (History / dashboard SoT) —
 * no bottom ContextualSelectionBar capsule.
 */

import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackerTable } from '@/components/PackerTable';
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { PackKpiStrip } from '@/components/packer/PackKpiStrip';
import {
  PackTriageBand,
  PackWorkspaceHeader,
} from '@/components/packer/PackWorkspaceHeader';
import { WORKBENCH_KPI_SURFACE } from '@/components/dashboard/workbench-kpi-collapse';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { usePackWorkspaceTab } from '@/hooks/usePackWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { dispatchPackActiveOrder } from '@/components/packer/usePackerOrderPane';
import { shippedOrderToPackPane } from '@/components/packer/shipped-order-to-pack-pane';
import type { ShippedOrder } from '@/types/orders';

export function PackWorkspaceView({ packerId }: { packerId: number }) {
  const { packView, setPackView } = usePackWorkspaceTab();
  const { newOpen, openNew, closeNew } = useNewOrderParam();
  const chrome = useWorkbenchSheetChrome(WORKBENCH_KPI_SURFACE.pack);
  const queueActive = packView === 'queue';
  const { selectionEnabled, selectMode, selectionOverlays } = useOrderRailSelection(
    'unshipped',
    { publish: queueActive },
  );

  const handleOpenQueueRecord = (record: ShippedOrder) => {
    dispatchPackActiveOrder(shippedOrderToPackPane(record));
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <WorkbenchSheetView
        chrome={chrome}
        className="h-full bg-transparent"
        swapKey={packView}
        tabs={({ className }) => (
          <PackWorkspaceHeader
            tab={packView}
            onSelectTab={setPackView}
            onNewOrder={openNew}
            className={className}
          />
        )}
        kpi={<PackKpiStrip mode={packView} packerId={packerId} />}
        triage={(p) => <PackTriageBand tab={packView} {...p} />}
        overlays={
          queueActive && selectionEnabled ? (
            <>
              <OrderRailCompare />
              <OrderRailShell />
              {selectionOverlays}
            </>
          ) : null
        }
      >
        {({ controlsEl }) =>
          packView === 'history' ? (
            <PackerTable
              packedBy={Number.isFinite(packerId) ? packerId : 0}
              toolbarPortalTarget={controlsEl}
            />
          ) : (
            <UnshippedTable
              strictSearchScope
              selectMode={selectMode}
              railSelection
              toolbarPortalTarget={controlsEl}
              onOpenRecord={handleOpenQueueRecord}
              searchEmptyTitle="No ready-to-pack orders"
              searchResultLabel="orders ready to pack"
              clearSearchLabel="Show all ready-to-pack"
            />
          )
        }
      </WorkbenchSheetView>
      <NewOrderEntryOverlay open={newOpen} onClose={closeNew} />
    </div>
  );
}
