'use client';

/** The `/receiving` right-pane column. */

import { useSearchParams } from 'next/navigation';
import ReceivingLinesTable from '@/components/station/ReceivingLinesTable';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { UnboxLineWorkspace } from '@/components/receiving/unbox/UnboxLineWorkspace';
import { TriageLineWorkspace } from '@/components/receiving/triage/TriageLineWorkspace';
import { RepairTable } from '@/components/repair';
import { RepairIntakeHost } from '@/components/repair/RepairIntakeHost';
import { PickupWorkspace } from '@/components/receiving/pickup/PickupWorkspace';
import { ReceivingLineRailShell } from '@/components/receiving/rail/ReceivingLineRailShell';
import { parseRepairTab } from '@/lib/walk-in/history-modes';
import type { ScanIntakeSurface } from '@/lib/receiving/scan';
import type {
  NavState,
  WorkspaceState,
} from '@/components/receiving/useReceivingWorkspacePane';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';

interface ReceivingRightPaneProps {
  mode: string;
  isTableOnlyMode: boolean;
  isTriageMode: boolean;
  isIncomingMode: boolean;
  selectMode: boolean;
  workspace: WorkspaceState | null;
  nav: NavState | null;
  scanInFlight: { tracking: string; startedAt: number; surface: ScanIntakeSurface } | null;
  /** Deep-link restore resolving — Unbox shows the workspace skeleton, not browse. */
  restorePending: boolean;
  /** Last scan hit an already-unboxed carton — Unbox shows a read-only receipt. */
  lookupReceipt: UnboxLookupScanDetail | null;
  onClearLookupReceipt: () => void;
  staffId: string;
  onCloseWorkspace: () => void;
}

export function ReceivingRightPane({
  mode,
  isTableOnlyMode,
  isTriageMode,
  isIncomingMode,
  selectMode,
  workspace,
  nav,
  scanInFlight,
  restorePending,
  lookupReceipt,
  onClearLookupReceipt,
  staffId,
  onCloseWorkspace,
}: ReceivingRightPaneProps) {
  const searchParams = useSearchParams();
  const isUnboxMode = mode === 'receive';

  const showTable = isTableOnlyMode && mode !== 'repair';

  if (mode === 'repair') {
    return (
      <RightPaneOverlayHost className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* The Repair Service desk: the desk stage gives the queue its fixed
            width and the staffer's fullscreen choice (the record plane's split). */}
        <DeskPageLayout className="h-full">
          <RepairTable filter={parseRepairTab(searchParams.get('tab'))} />
        </DeskPageLayout>
        {/* `?new=true` intake lives here because the left rail that used to host
            it is gone — favorites became a scope of the catalog picker, so the
            repair desk is rail-less. Portal host: no in-flow DOM. */}
        <RepairIntakeHost />
      </RightPaneOverlayHost>
    );
  }

  if (mode === 'pickup') {
    return (
      <RightPaneOverlayHost className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PickupWorkspace selectedOrderId={Number(searchParams.get('lcpu')) || null} />
      </RightPaneOverlayHost>
    );
  }

  if (isUnboxMode) {
    return (
      <RightPaneOverlayHost className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <UnboxLineWorkspace
          staffId={staffId}
          workspace={workspace}
          nav={nav}
          restorePending={restorePending}
          lookupReceipt={lookupReceipt}
          onClearLookupReceipt={onClearLookupReceipt}
          onCloseWorkspace={onCloseWorkspace}
        />
      </RightPaneOverlayHost>
    );
  }

  if (isTriageMode) {
    return (
      <RightPaneOverlayHost className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TriageLineWorkspace
          staffId={staffId}
          workspace={workspace}
          nav={nav}
          scanInFlight={scanInFlight}
          onCloseWorkspace={onCloseWorkspace}
        />
      </RightPaneOverlayHost>
    );
  }

  return (
    <RightPaneOverlayHost className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="absolute inset-0 flex-col overflow-hidden"
        style={{ display: showTable ? 'flex' : 'none' }}
        aria-hidden={!showTable}
      >
        <ReceivingLinesTable
          selectMode={selectMode}
        />
      </div>
      {showTable ? (
        <ReceivingLineRailShell surface={isIncomingMode ? 'incoming' : 'lines'} />
      ) : null}
    </RightPaneOverlayHost>
  );
}
