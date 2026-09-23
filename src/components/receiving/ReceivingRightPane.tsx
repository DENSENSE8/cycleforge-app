'use client';

/**
 * The `/receiving` right-pane column. The History/Incoming table stays mounted
 * (display-toggled) so its cache + scroll survive tab flips; over it the focused
 * line workspace soft-swaps in. Unbox, Triage, and Local Pickup share the
 * browse+overlay crossfade SoT (`UnboxLineWorkspace` / `TriageLineWorkspace`);
 * pickup reuses Unbox's shell (no parallel Pickup* UI). Repair mounts
 * `RepairTable` with `RepairWorkspaceHeader` (Active/Done · search · Add) —
 * LedgerGrid day-banded queue, not ReceivingLines.
 *
 * Bulk selection no longer mounts a bottom capsule — History / Incoming open
 * `ReceivingLineRailShell` on `RightRailHost` instead.
 */

import { useSearchParams } from 'next/navigation';
import ReceivingLinesTable from '@/components/station/ReceivingLinesTable';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { UnboxLineWorkspace } from '@/components/receiving/unbox/UnboxLineWorkspace';
import { TriageLineWorkspace } from '@/components/receiving/triage/TriageLineWorkspace';
import { IncomingDetailsPanel } from '@/components/sidebar/receiving/IncomingDetailsPanel';
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
import type { IncomingDetailsTarget } from '@/components/receiving/useReceivingDetailOverlays';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';
import { HistoryCartonTriagePanel } from '@/components/receiving/history/HistoryCartonTriagePanel';
import type { HistoryTriageTarget } from '@/lib/receiving/history-triage-row';

/**
 * Shared mount for {@link IncomingDetailsPanel} — Unbox, Triage, and
 * History/Incoming all render this so order-chip Details is not a no-op on
 * early-return mode branches.
 */
function IncomingDetailsMount({
  target,
  onClose,
}: {
  target: IncomingDetailsTarget | null;
  onClose: () => void;
}) {
  if (!target) return null;
  return (
    <IncomingDetailsPanel
      zohoPurchaseOrderId={target.poId}
      poNumberHint={target.poNumber}
      shipmentId={target.shipmentId}
      inboundSourceType={target.inboundSourceType}
      inboundSourceOrderId={target.inboundSourceOrderId}
      focusReceivingId={target.receivingId}
      focusReceivingLineId={target.receivingLineId}
      seedRow={target.seedRow}
      onClose={onClose}
    />
  );
}

function HistoryTriageMount({
  target,
  onClose,
}: {
  target: HistoryTriageTarget | null;
  onClose: () => void;
}) {
  if (!target) return null;
  return (
    <HistoryCartonTriagePanel
      target={target}
      onClose={onClose}
    />
  );
}

/** Unbox host — View chrome context bridges workspace grid ↔ History rail. */
function UnboxHistoryHost({
  staffId,
  workspace,
  nav,
  restorePending,
  lookupReceipt,
  onClearLookupReceipt,
  onCloseWorkspace,
  incomingDetails,
  onCloseIncoming,
  historyTriage,
  onCloseHistoryTriage,
}: {
  staffId: string;
  workspace: WorkspaceState | null;
  nav: NavState | null;
  restorePending: boolean;
  lookupReceipt: UnboxLookupScanDetail | null;
  onClearLookupReceipt: () => void;
  onCloseWorkspace: () => void;
  incomingDetails: IncomingDetailsTarget | null;
  onCloseIncoming: () => void;
  historyTriage: HistoryTriageTarget | null;
  onCloseHistoryTriage: () => void;
}) {
  return (
    <UnboxHistoryHostInner
        staffId={staffId}
        workspace={workspace}
        nav={nav}
        restorePending={restorePending}
        lookupReceipt={lookupReceipt}
        onClearLookupReceipt={onClearLookupReceipt}
        onCloseWorkspace={onCloseWorkspace}
        incomingDetails={incomingDetails}
        onCloseIncoming={onCloseIncoming}
        historyTriage={historyTriage}
        onCloseHistoryTriage={onCloseHistoryTriage}
    />
  );
}

function UnboxHistoryHostInner({
  staffId,
  workspace,
  nav,
  restorePending,
  lookupReceipt,
  onClearLookupReceipt,
  onCloseWorkspace,
  incomingDetails,
  onCloseIncoming,
  historyTriage,
  onCloseHistoryTriage,
}: {
  staffId: string;
  workspace: WorkspaceState | null;
  nav: NavState | null;
  restorePending: boolean;
  lookupReceipt: UnboxLookupScanDetail | null;
  onClearLookupReceipt: () => void;
  onCloseWorkspace: () => void;
  incomingDetails: IncomingDetailsTarget | null;
  onCloseIncoming: () => void;
  historyTriage: HistoryTriageTarget | null;
  onCloseHistoryTriage: () => void;
}) {
  // The View-only shell existed to reach the column-display rail; with the rail
  // deleted (2026-08-29) a PICKED carton is the only thing that opens the
  // inspector, so the two states collapse to one.
  const recordInspectOpen = Boolean(historyTriage);
  const inspectorOpen = recordInspectOpen;
  return (
    <>
      <UnboxLineWorkspace
        staffId={staffId}
        workspace={workspace}
        nav={nav}
        restorePending={restorePending}
        lookupReceipt={lookupReceipt}
        onClearLookupReceipt={onClearLookupReceipt}
        onCloseWorkspace={onCloseWorkspace}
        recordInspectOpen={recordInspectOpen}
        inspectorOpen={inspectorOpen}
      />
      <IncomingDetailsMount target={incomingDetails} onClose={onCloseIncoming} />
      <HistoryTriageMount target={historyTriage} onClose={onCloseHistoryTriage} />
    </>
  );
}

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
  incomingDetails: IncomingDetailsTarget | null;
  onCloseIncoming: () => void;
  historyTriage: HistoryTriageTarget | null;
  onCloseHistoryTriage: () => void;
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
  incomingDetails,
  onCloseIncoming,
  historyTriage,
  onCloseHistoryTriage,
  onCloseWorkspace,
}: ReceivingRightPaneProps) {
  const searchParams = useSearchParams();
  const isUnboxMode = mode === 'receive';

  const showTable = isTableOnlyMode && mode !== 'repair';
  const showSelectionRail = showTable;

  if (mode === 'repair') {
    return (
      <RightPaneOverlayHost className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <RepairTable filter={parseRepairTab(searchParams.get('tab'))} />
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
        <UnboxHistoryHost
          staffId={staffId}
          workspace={workspace}
          nav={nav}
          restorePending={restorePending}
          lookupReceipt={lookupReceipt}
          onClearLookupReceipt={onClearLookupReceipt}
          onCloseWorkspace={onCloseWorkspace}
          incomingDetails={incomingDetails}
          onCloseIncoming={onCloseIncoming}
          historyTriage={historyTriage}
          onCloseHistoryTriage={onCloseHistoryTriage}
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
        <IncomingDetailsMount target={incomingDetails} onClose={onCloseIncoming} />
      </RightPaneOverlayHost>
    );
  }

  return (
    <RightPaneOverlayHost className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ display: showTable ? 'block' : 'none' }}
        aria-hidden={!showTable}
      >
        <ReceivingLinesTable
          selectMode={selectMode}
        />
      </div>

      <IncomingDetailsMount target={incomingDetails} onClose={onCloseIncoming} />

      {/*
        History triage (`detail:history`) — the Inbound desk's Docked lane is a
        history surface, and operator 2026-09-14 requires it to behave like
        Unbox History: left-click inspects, double-click opens LineEditPanel.
        Only `UnboxHistoryHost` mounted this, so a docked click dispatched
        `receiving-open-history-triage` into a page with no listener host — a
        dead click. Same mount, same occupant id; one of the two branches runs.
      */}
      <HistoryTriageMount target={historyTriage} onClose={onCloseHistoryTriage} />

      {showSelectionRail ? (
        <ReceivingLineRailShell
          surface={isIncomingMode ? 'incoming' : 'lines'}
          // Either 1-row inspector suppresses the batch shell, so the two
          // registrars never fight over the slot (ReceivingLineRailShell).
          inspectOpen={Boolean(incomingDetails) || Boolean(historyTriage)}
        />
      ) : null}
    </RightPaneOverlayHost>
  );
}
