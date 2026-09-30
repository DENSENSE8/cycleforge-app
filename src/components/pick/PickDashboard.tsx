'use client';

/** Picker desk workspace (`/pick`) — thin composition layer over the shipping workspace and its order panes; a scanned repair opens its record on the Repair desk. */

import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { StationDetailsHandler } from '@/components/station/StationDetailsHandler';
import { PickOrderWorkspace } from '@/components/pick/PickOrderWorkspace';
import { usePickOrderPanes } from '@/components/pick/usePickOrderPanes';
import { useOpenScannedRepair } from '@/components/pick/useOpenScannedRepair';
import { dispatchTechCloseActiveOrder } from '@/components/tech/tech-active-order-events';
import { dispatchCloseShippedDetails, dispatchUpNextPreview } from '@/utils/events';

export function PickDashboard() {
  const { activeOrderPane, setActiveOrderPane, previewSel, setPreviewSel } = usePickOrderPanes();
  useOpenScannedRepair();

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <RightPaneOverlayHost className="relative flex h-full min-h-0 flex-col overflow-hidden">
            <PickOrderWorkspace
              activeOrderPane={activeOrderPane}
              onCloseActiveOrder={() => {
                dispatchTechCloseActiveOrder();
                setActiveOrderPane(null);
                setPreviewSel(null);
              }}
              onActiveOrderChange={(next) =>
                setActiveOrderPane((prev) => (prev ? { ...prev, activeOrder: next } : null))
              }
              previewSel={previewSel}
              onClosePreview={() => {
                setPreviewSel(null);
                dispatchUpNextPreview(null);
                dispatchCloseShippedDetails();
              }}
            />
          </RightPaneOverlayHost>
        </div>
      </div>

      <StationDetailsHandler viewMode="history" />
    </div>
  );
}
