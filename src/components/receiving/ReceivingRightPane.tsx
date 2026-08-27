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
import {
  HistoryViewChromeProvider,
  useHistoryViewChrome,
} from '@/components/receiving/history/history-view-chrome-context';
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
  const { viewShellOpen, setViewShellOpen } = useHistoryViewChrome();
  if (!target && !viewShellOpen) return null;
  return (
    <HistoryCartonTriagePanel
      target={target}
      onClose={() => {
        setViewShellOpen(false);
        onClose();
      }}
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
    <HistoryViewChromeProvider>
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
    </HistoryViewChromeProvider>
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
  const { viewShellOpen } = useHistoryViewChrome();
  // TWO states, deliberately not one. `recordInspectOpen` gates the multi-select
  // batch rail — only a PICKED carton may take that slot, or opening the
  // View-only shell to reach ▦ would silently kill print / claim / copy on the
  // rows an operator had selected. `inspectorOpen` is the Band 3 toggle's own
  // open face, which must go pressed for either.
  const recordInspectOpen = Boolean(historyTriage);
  const inspectorOpen = recordInspectOpen || viewShellOpen;
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

      {showSelectionRail ? (
        <ReceivingLineRailShell
          surface={isIncomingMode ? 'incoming' : 'lines'}
          inspectOpen={Boolean(incomingDetails)}
        />
      ) : null}
    </RightPaneOverlayHost>
  );
}
