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

import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useSearchParams } from 'next/navigation';
import ReceivingLinesTable from '@/components/station/ReceivingLinesTable';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { UnboxLineWorkspace } from '@/components/receiving/unbox/UnboxLineWorkspace';
import { TriageLineWorkspace } from '@/components/receiving/triage/TriageLineWorkspace';
import { IncomingDetailsPanel } from '@/components/sidebar/receiving/IncomingDetailsPanel';
import { EmailTriagePanel } from '@/components/receiving/EmailTriagePanel';
import type { IncomingView } from '@/components/receiving/EmailTriagePanel';
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

interface ReceivingRightPaneProps {
  mode: string;
  isTableOnlyMode: boolean;
  isTriageMode: boolean;
  isIncomingMode: boolean;
  /** Incoming right-pane sub-view (`?incview=`): the POS table or Email Triage.
   *  The toggle control lives in the sidebar (IncomingSidebarPanel headerRows);
   *  here we only read it to pick which sub-view to render. */
  incomingView: IncomingView;
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
  onCloseWorkspace: () => void;
}

export function ReceivingRightPane({
  mode,
  isTableOnlyMode,
  isTriageMode,
  isIncomingMode,
  incomingView,
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
  onCloseWorkspace,
}: ReceivingRightPaneProps) {
  const searchParams = useSearchParams();
  const isUnboxMode = mode === 'receive';
  const { presence: emailPane, transition: emailTransition } = useMotionRole(motionRole.swap.focus);

  const showEmailTriage = isIncomingMode && incomingView === 'email';
  const showTable = isTableOnlyMode && !showEmailTriage && mode !== 'repair';
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
        className="absolute inset-0 overflow-hidden"
        style={{ display: showTable ? 'block' : 'none' }}
        aria-hidden={!showTable}
      >
        <ReceivingLinesTable
          selectMode={selectMode}
        />
      </div>

      <AnimatePresence initial={false}>
        {showEmailTriage ? (
          <motion.div
            key="incoming-email-triage"
            initial={emailPane.initial}
            animate={emailPane.animate}
            exit={emailPane.exit}
            transition={emailTransition}
            className="absolute inset-0 z-10 overflow-hidden"
          >
            <EmailTriagePanel />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isIncomingMode && incomingView !== 'email' && incomingDetails ? (
        <IncomingDetailsPanel
          zohoPurchaseOrderId={incomingDetails.poId}
          poNumberHint={incomingDetails.poNumber}
          shipmentId={incomingDetails.shipmentId}
          inboundSourceType={incomingDetails.inboundSourceType}
          inboundSourceOrderId={incomingDetails.inboundSourceOrderId}
          onClose={onCloseIncoming}
        />
      ) : null}

      {showSelectionRail ? (
        <ReceivingLineRailShell
          surface={isIncomingMode ? 'incoming' : 'lines'}
          inspectOpen={Boolean(incomingDetails)}
        />
      ) : null}
    </RightPaneOverlayHost>
  );
}
