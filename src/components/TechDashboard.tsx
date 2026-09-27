'use client';

/** Quality Control bench (`/test`) — thin composition layer over the testing workspace and its overlays. */

import { useState } from 'react';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { ReceivingLineRailShell } from '@/components/receiving/rail/ReceivingLineRailShell';
import { TestingLineWorkspace } from '@/components/tech/TestingLineWorkspace';
import { useTechTestingSelection } from '@/components/tech/useTechTestingSelection';
import { TechDashboardOverlays } from '@/components/tech/TechDashboardOverlays';

interface TechDashboardProps {
  techId: string;
}

export default function TechDashboard({ techId }: TechDashboardProps) {
  // Currently-selected receiving line id for the testing pane.
  const [testingLineId, setTestingLineId] = useState<number | null>(null);

  const browseActive = testingLineId === null;

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

  // Suppress batch rail while claim / assign picker owns the edge (line open
  // already gates via browseActive → publish false inside the selection hook).
  const railEnabled = browseActive && testingClaimRow == null && testingAssignRows == null;

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <RightPaneOverlayHost className="relative flex h-full min-h-0 flex-col overflow-hidden">
            {/* Queue/history workbench; a focused line crossfades over it. */}
            <TestingLineWorkspace
              staffId={techId}
              selectedLineId={testingLineId}
              onSelectedLineChange={setTestingLineId}
              testingSelectMode={testingSelectMode}
              onOpenTestingLine={openTestingLine}
            />
            <ReceivingLineRailShell surface="lines" enabled={railEnabled} />
          </RightPaneOverlayHost>
        </div>
      </div>

      <TechDashboardOverlays
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
