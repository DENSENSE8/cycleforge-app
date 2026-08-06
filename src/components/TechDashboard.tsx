'use client';

/**
 * Tech dashboard — thin composition layer.
 *
 * Logic lives in focused hooks under `@/components/tech/`:
 *   - useTechRightView ........... `?view=` → right-pane mode
 *   - useTechTestingSelection .... Testing workbench rail multi-select + actions
 *   - useTechOrderPanes .......... active-order + Up Next preview (event bridges)
 *   - useTechDetailOverlays ...... selected log + repair panel (event bridges)
 *
 * Multi-select opens `ReceivingLineRailShell` on RightRailHost (Unbox History
 * SoT) — no bottom ContextualSelectionBar. Claim modal suppresses the shell
 * while it owns the right edge (receiving R7).
 */

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

interface TechDashboardProps {
  techId: string;
}

export default function TechDashboard({ techId }: TechDashboardProps) {
  const { rightViewMode, isTestingMode } = useTechRightView();

  // Currently-selected receiving line id for the testing pane. Lives at dashboard
  // level so the sidebar's recent rail (rendered in TechSidebarPanel) can
  // highlight the same row the workspace shows, and so bulk Select is gated
  // to the history browse (no line open).
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

  const { activeOrderPane, setActiveOrderPane, previewOrder, setPreviewOrder } = useTechOrderPanes();

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
              onCloseActiveOrder={() => setActiveOrderPane(null)}
              onActiveOrderChange={(next) =>
                setActiveOrderPane((prev) => (prev ? { ...prev, activeOrder: next } : null))
              }
              previewOrder={previewOrder}
              onClosePreview={() => setPreviewOrder(null)}
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
