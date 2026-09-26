'use client';

/**
 * `/receiving` right pane — thin composition layer. Headerless; driven entirely
 * by the sidebar's mode pills (`?mode=`) + selection state.
 *
 *   workspace open          → ReceivingLineWorkspace (focused line editor)
 *   no selection, receive   → ReceivingLinesTable (history)
 *
 * Logic lives in focused hooks; the rail-selection layer publishes bulk actions
 * into `rail-actions-store` so History / Incoming / Tech Testing open the right
 * rail instead of the bottom capsule:
 *   - useReceivingDashboardMode .... `?mode=` → surface flags
 *   - useReceivingWorkspacePane .... workspace + nav + scan loader + recovery
 *   - useReceivingLineRailSelection  publish + claim for History/Incoming
 */

import { useCallback } from 'react';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { useAuth } from '@/contexts/AuthContext';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import { useReceivingLineRailSelection } from '@/hooks/useReceivingLineRailSelection';
import { useReceivingDashboardMode } from '@/components/receiving/useReceivingDashboardMode';
import { useReceivingWorkspacePane } from '@/components/receiving/useReceivingWorkspacePane';
import { ReceivingRightPane } from '@/components/receiving/ReceivingRightPane';
import { ReceivingDashboardOverlays } from '@/components/receiving/ReceivingDashboardOverlays';
import { formatReceivingCopyRow } from '@/lib/receiving/receiving-copy-row';

export default function ReceivingDashboard() {
  useRealtimeInvalidation({ receiving: true });
  useRealtimeToasts('receiving');
  const { user } = useAuth();
  const staffId = String(user?.staffId ?? '');

  const { mode, isTriageMode, isIncomingMode, isRepairMode, isTableOnlyMode } =
    useReceivingDashboardMode();

  const {
    workspace,
    setWorkspace,
    nav,
    setNav,
    scanInFlight,
    restorePending,
    lookupReceipt,
    clearLookupReceipt,
  } = useReceivingWorkspacePane();

  const {
    selectMode,
    claimRow,
    setClaimRow,
    exitSelectMode,
  } = useReceivingLineRailSelection({
    scope: RECEIVING_SELECTION_SCOPE,
    // History / Incoming only — Repair mounts its own queue (no line bulk select).
    active: isTableOnlyMode && !isRepairMode,
    formatCopyRow: formatReceivingCopyRow,
  });

  const closeWorkspace = useCallback(() => {
    setWorkspace(null);
    setNav(null);
    dispatchReceivingWorkspaceClose();
    emitReceiving('receiving-clear-line');
  }, [setWorkspace, setNav]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ReceivingRightPane
        mode={mode}
        isTableOnlyMode={isTableOnlyMode}
        isTriageMode={isTriageMode}
        isIncomingMode={isIncomingMode}
        selectMode={selectMode}
        workspace={workspace}
        nav={nav}
        scanInFlight={scanInFlight}
        restorePending={restorePending}
        lookupReceipt={lookupReceipt}
        onClearLookupReceipt={clearLookupReceipt}
        staffId={staffId}
        onCloseWorkspace={closeWorkspace}
      />

      <ReceivingDashboardOverlays
        claimRow={claimRow}
        onCloseClaim={() => setClaimRow(null)}
        onClaimFiled={() => {
          setClaimRow(null);
          exitSelectMode();
        }}
      />
    </div>
  );
}
