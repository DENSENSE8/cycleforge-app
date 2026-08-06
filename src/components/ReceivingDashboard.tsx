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
 *   - useReceivingDetailOverlays ... carton details stack + incoming PO panel
 *   - useReceivingLineRailSelection  publish + claim for History/Incoming
 */

import { useCallback, useEffect } from 'react';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { useAuth } from '@/contexts/AuthContext';
import { dispatchReceivingWorkspaceClose, dispatchReceivingCloseHistoryTriage } from '@/utils/events';
import { emitReceiving } from '@/components/receiving/receiving-events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import { useReceivingLineRailSelection } from '@/hooks/useReceivingLineRailSelection';
import { useReceivingDashboardMode } from '@/components/receiving/useReceivingDashboardMode';
import { useReceivingWorkspacePane } from '@/components/receiving/useReceivingWorkspacePane';
import { useReceivingDetailOverlays } from '@/components/receiving/useReceivingDetailOverlays';
import { ReceivingRightPane } from '@/components/receiving/ReceivingRightPane';
import { ReceivingDashboardOverlays } from '@/components/receiving/ReceivingDashboardOverlays';

/** Copy line for a receiving carton/line: PO • SKU • tracking. */
function formatReceivingCopyRow(r: ReceivingLineRow): string {
  const po = (r.zoho_purchaseorder_number || r.zoho_purchaseorder_id || '').trim();
  const sku = (r.sku || '').trim();
  const tracking = (r.tracking_number || '').trim();
  return [po && `PO ${po}`, sku && `SKU ${sku}`, tracking && `TRK ${tracking}`]
    .filter(Boolean)
    .join(' • ');
}

export default function ReceivingDashboard() {
  useRealtimeInvalidation({ receiving: true });
  useRealtimeToasts('receiving');
  const { user } = useAuth();
  const staffId = String(user?.staffId ?? '');

  const { mode, isTriageMode, isIncomingMode, isRepairMode, isTableOnlyMode, incomingView } =
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
    overlayLog,
    setOverlayLog,
    incomingDetails,
    setIncomingDetails,
    historyTriage,
    setHistoryTriage,
    enrichOverlayLog,
  } = useReceivingDetailOverlays(isIncomingMode, incomingView);

  const {
    selectMode,
    selectedRows,
    claimRow,
    setClaimRow,
    exitSelectMode,
  } = useReceivingLineRailSelection({
    scope: RECEIVING_SELECTION_SCOPE,
    // History / Incoming only — Repair mounts its own queue (no line bulk select).
    active: isTableOnlyMode && !isRepairMode,
    formatCopyRow: formatReceivingCopyRow,
  });

  // Incoming 2+ yields the inspect panel to the batch shell (R3 / R5).
  useEffect(() => {
    if (isIncomingMode && selectedRows.length >= 2 && incomingDetails) {
      setIncomingDetails(null);
    }
  }, [isIncomingMode, selectedRows.length, incomingDetails, setIncomingDetails]);

  // History triage (1-row inspect) yields to the batch shell at 2+ checks.
  useEffect(() => {
    if (selectedRows.length >= 2 && historyTriage) {
      setHistoryTriage(null);
    }
  }, [selectedRows.length, historyTriage, setHistoryTriage]);

  const closeWorkspace = useCallback(() => {
    setWorkspace(null);
    setNav(null);
    dispatchReceivingWorkspaceClose();
    emitReceiving('receiving-clear-line');
  }, [setWorkspace, setNav]);

  const closeIncoming = useCallback(() => {
    setIncomingDetails(null);
    emitReceiving('receiving-clear-line');
    // R6 / D4 — close clears the check-set so rows do not stay selected with
    // no visible dismiss affordance after the capsule is gone.
    exitSelectMode();
  }, [setIncomingDetails, exitSelectMode]);

  const closeHistoryTriage = useCallback(() => {
    dispatchReceivingCloseHistoryTriage();
    emitReceiving('receiving-clear-line');
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ReceivingRightPane
        mode={mode}
        isTableOnlyMode={isTableOnlyMode}
        isTriageMode={isTriageMode}
        isIncomingMode={isIncomingMode}
        incomingView={incomingView}
        selectMode={selectMode}
        workspace={workspace}
        nav={nav}
        scanInFlight={scanInFlight}
        restorePending={restorePending}
        lookupReceipt={lookupReceipt}
        onClearLookupReceipt={clearLookupReceipt}
        staffId={staffId}
        incomingDetails={incomingDetails}
        onCloseIncoming={closeIncoming}
        historyTriage={historyTriage}
        onCloseHistoryTriage={closeHistoryTriage}
        onCloseWorkspace={closeWorkspace}
      />

      <ReceivingDashboardOverlays
        overlayLog={overlayLog}
        onCloseOverlayLog={() => setOverlayLog(null)}
        onOverlayLogUpdated={() => {
          if (overlayLog?.id) void enrichOverlayLog(Number(overlayLog.id));
        }}
        onOverlayLogDeleted={() => setOverlayLog(null)}
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
