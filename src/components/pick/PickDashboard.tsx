'use client';

/** Picker desk workspace (`/pick`) — thin composition layer over the shipping workspace, its order panes and the repair rail. */

import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { StationDetailsHandler } from '@/components/station/StationDetailsHandler';
import { AnimatePresence } from '@/design-system/motion';
import { TechRepairRail } from '@/components/tech/TechRepairRail';
import { PickOrderWorkspace } from '@/components/pick/PickOrderWorkspace';
import { usePickOrderPanes } from '@/components/pick/usePickOrderPanes';
import { usePickRepairPanel } from '@/components/pick/usePickRepairPanel';
import { dispatchTechCloseActiveOrder } from '@/components/tech/tech-active-order-events';
import { dispatchCloseShippedDetails, dispatchUpNextPreview } from '@/utils/events';

interface PickDashboardProps {
  pickerId: string;
}

export function PickDashboard({ pickerId }: PickDashboardProps) {
  const { activeOrderPane, setActiveOrderPane, previewSel, setPreviewSel } = usePickOrderPanes();
  const { repairPanel, setRepairPanel, loadingRepair } = usePickRepairPanel();

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <RightPaneOverlayHost className="relative flex h-full min-h-0 flex-col overflow-hidden">
            <PickOrderWorkspace
              pickerId={pickerId}
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

      {loadingRepair && (
        <div className="fixed inset-0 bg-scrim/20 z-panelBackdrop flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin pointer-events-auto" />
        </div>
      )}
      <AnimatePresence>
        {repairPanel && (
          <TechRepairRail
            repair={repairPanel.record}
            assignmentId={repairPanel.assignmentId}
            assignedTechId={repairPanel.assignedTechId}
            onClose={() => setRepairPanel(null)}
            onUpdate={() => setRepairPanel(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
