'use client';

/** Tech dashboard — thin composition layer. */

import { useState } from 'react';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { ReceivingLineRailShell } from '@/components/receiving/rail/ReceivingLineRailShell';
import { StationDetailsHandler } from '@/components/station/StationDetailsHandler';
import { useTechRightView } from '@/components/tech/useTechRightView';
import { useTechTestingSelection } from '@/components/tech/useTechTestingSelection';
import { useTechOrderPanes } from '@/components/tech/useTechOrderPanes';
import { useTechDetailOverlays } from '@/components/tech/useTechDetailOverlays';
import { TechRightPane } from '@/components/tech/TechRightPane';
import { TechDashboardOverlays } from '@/components/tech/TechDashboardOverlays';
import { dispatchTechCloseActiveOrder } from '@/components/tech/tech-active-order-events';
import { dispatchCloseShippedDetails, dispatchUpNextPreview } from '@/utils/events';

interface TechDashboardProps {
  techId: string;
}

export default function TechDashboard({ techId }: TechDashboardProps) {
  const { rightViewMode, isTestingMode } = useTechRightView();

  // Currently-selected receiving line id for the testing pane.
  const [testingLineId, setTestingLineId] = useState<number | null>(null);

  const browseActive = isTestingMode && testingLineId === null;

  const {
    testingSelectMode,
    testingClaimRow,
    setTestingClaimRow,
    testingAssignRows,
    setTestingAssignRows,
    assignTestingLines,
    exitTestingSelect,
    openTestingLine,
  } = useTechTestingSelection(
    browseActive,
    Number.isFinite(Number(techId)) && Number(techId) > 0 ? Number(techId) : null,
  );

  const { activeOrderPane, setActiveOrderPane, previewSel, setPreviewSel } = useTechOrderPanes();

  const {
    repairPanel,
    setRepairPanel,
    loadingRepair,
  } = useTechDetailOverlays();

  // Suppress batch rail while claim / assign picker owns the edge (line open
  // already gates via browseActive → publish false inside the selection hook).
  const railEnabled = browseActive && testingClaimRow == null && testingAssignRows == null;

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <RightPaneOverlayHost className="relative flex h-full min-h-0 flex-col overflow-hidden">
            <TechRightPane
              rightViewMode={rightViewMode}
              techId={techId}
              testingLineId={testingLineId}
              onTestingLineChange={setTestingLineId}
              testingSelectMode={testingSelectMode}
              onOpenTestingLine={openTestingLine}
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
            <ReceivingLineRailShell surface="lines" enabled={railEnabled} />
          </RightPaneOverlayHost>
        </div>
      </div>

      <StationDetailsHandler viewMode="history" />

      <TechDashboardOverlays
        repairPanel={repairPanel}
        onCloseRepair={() => setRepairPanel(null)}
        loadingRepair={loadingRepair}
        testingClaimRow={testingClaimRow}
        onCloseClaim={() => setTestingClaimRow(null)}
        onClaimFiled={() => {
          setTestingClaimRow(null);
          exitTestingSelect();
        }}
        testingAssignRows={testingAssignRows}
        onCloseAssign={() => setTestingAssignRows(null)}
        onAssignPick={(assigneeId) => {
          if (testingAssignRows) void assignTestingLines(testingAssignRows, assigneeId);
        }}
      />
    </div>
  );
}
