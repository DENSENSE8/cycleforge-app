'use client';

/**
 * `/receiving` right pane — thin composition layer. Headerless; driven entirely
 * by the sidebar's mode pills (`?mode=`) + selection state.
 *
 *   workspace open          → ReceivingLineWorkspace (focused line editor)
 *   no selection, receive   → ReceivingLinesTable (history)
 *
 * Logic lives in focused hooks; the bulk-selection layer is the SHARED
 * `useReceivingLineBulkSelection` (also used by the Tech dashboard) so the two
 * receiving-line history feeds don't hand-roll parallel copies:
 *   - useReceivingDashboardMode .... `?mode=` → surface flags
 *   - useReceivingWorkspacePane .... workspace + nav + scan loader + recovery
 *   - useReceivingDetailOverlays ... details stack / pickup review / incoming panel
 *   - useReceivingLineBulkSelection  shared History/Incoming bulk actions + claim
 */

import { useCallback } from 'react';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { useAuth } from '@/contexts/AuthContext';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  RECEIVING_SELECTION_SCOPE,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import { useReceivingLineBulkSelection } from '@/hooks/useReceivingLineBulkSelection';
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

  const { workspace, setWorkspace, nav, setNav, scanInFlight, restorePending } =
    useReceivingWorkspacePane();

  const {
    overlayLog,
    setOverlayLog,
    incomingDetails,
    setIncomingDetails,
    enrichOverlayLog,
  } = useReceivingDetailOverlays(isIncomingMode, incomingView);

  const {
    selectMode,
    selectedRows,
    claimRow,
    setClaimRow,
    exitSelectMode,
    bulkActions,
  } = useReceivingLineBulkSelection({
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
    // Triage stays in triage (its rail auto-selects the next top). Unbox
    // browse-first — clear selection and return to the workbench feed (no
    // jump to History).
  }, [setWorkspace, setNav]);

  // Triage (label "Arrival") deliberately shares the SAME right pane as Unbox:
  // the selected carton opens in the full ReceivingLineWorkspace, so identifying
  // a carton before unboxing uses the exact same editor. It is NOT table-only,
  // so it falls through to the workspace-overlay path.

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ReceivingRightPane
        mode={mode}
        isTableOnlyMode={isTableOnlyMode}
        isTriageMode={isTriageMode}
        isIncomingMode={isIncomingMode}
        incomingView={incomingView}
        selectMode={selectMode}
        selectedRows={selectedRows}
        bulkActions={bulkActions}
        workspace={workspace}
        nav={nav}
        scanInFlight={scanInFlight}
        restorePending={restorePending}
        staffId={staffId}
        incomingDetails={incomingDetails}
        onCloseIncoming={() => {
          setIncomingDetails(null);
          emitReceiving('receiving-clear-line');
        }}
        onCloseWorkspace={closeWorkspace}
      />

      <ReceivingDashboardOverlays
        overlayLog={overlayLog}
        onCloseOverlayLog={() => setOverlayLog(null)}
        onOverlayLogUpdated={() => {
          if (overlayLog) void enrichOverlayLog(Number(overlayLog.id));
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
