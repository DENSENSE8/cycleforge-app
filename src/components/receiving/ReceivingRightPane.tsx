'use client';

/**
 * The `/receiving` right-pane column. The History/Incoming table stays mounted
 * (display-toggled) so its cache + scroll survive tab flips; over it the focused
 * line workspace soft-swaps in. Unbox and Triage each own a browse+overlay
 * crossfade shell (`UnboxLineWorkspace` / `TriageLineWorkspace`).
 */

import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import ReceivingLinesTable from '@/components/station/ReceivingLinesTable';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/ReceivingLinesTable';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { UnboxLineWorkspace } from '@/components/receiving/unbox/UnboxLineWorkspace';
import { TriageLineWorkspace } from '@/components/receiving/triage/TriageLineWorkspace';
import { IncomingDetailsPanel } from '@/components/sidebar/receiving/IncomingDetailsPanel';
import { EmailTriagePanel } from '@/components/receiving/EmailTriagePanel';
import type { IncomingView } from '@/components/receiving/EmailTriagePanel';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import type { ScanIntakeSurface } from '@/lib/receiving/scan';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type {
  NavState,
  WorkspaceState,
} from '@/components/receiving/useReceivingWorkspacePane';
import type { IncomingDetailsTarget } from '@/components/receiving/useReceivingDetailOverlays';

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
  selectedRows: ReceivingLineRow[];
  bulkActions: SelectionAction<ReceivingLineRow>[];
  workspace: WorkspaceState | null;
  nav: NavState | null;
  scanInFlight: { tracking: string; startedAt: number; surface: ScanIntakeSurface } | null;
  /** Deep-link restore resolving — Unbox shows the workspace skeleton, not browse. */
  restorePending: boolean;
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
  selectedRows,
  bulkActions,
  workspace,
  nav,
  scanInFlight,
  restorePending,
  staffId,
  incomingDetails,
  onCloseIncoming,
  onCloseWorkspace,
}: ReceivingRightPaneProps) {
  const isUnboxMode = mode === 'receive';
  // Incoming Email-Triage sub-view swap keeps the snappy canonical crossfade —
  // it fades in over the (display:none) table, so there is no second pane to
  // ghost against and no need for the slower settle.
  const emailPane = useMotionPresence(framerPresence.workbenchPane);
  const emailTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  // Incoming hosts two right-pane sub-views toggled by the band (`?incview=`):
  // the POS table (default) and the Email Triage worklist. The table stays
  // mounted (cache + scroll); Email Triage crossfades in over it, both sitting
  // below the 45px toggle band.
  const showEmailTriage = isIncomingMode && incomingView === 'email';
  const showTable = isTableOnlyMode && !showEmailTriage;

  if (isUnboxMode) {
    return (
      <RightPaneOverlayHost className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <UnboxLineWorkspace
          staffId={staffId}
          workspace={workspace}
          nav={nav}
          restorePending={restorePending}
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
      {/* History/Incoming-POS table — always mounted to keep its react-query
          cache, in-progress search results, and scroll position alive across tab
          flips. Hidden (not unmounted) so auto-select / first-mount effects
          don't re-fire on every close. */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ display: showTable ? 'block' : 'none' }}
        aria-hidden={!showTable}
      >
        <ReceivingLinesTable
          selectMode={selectMode}
        />
      </div>

      {/* Email Triage worklist — crossfades in over the (hidden) table on
          `?incview=email`, via the canonical workbench right-pane preset. */}
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

      {/* Incoming details panel — registers into RightRailHost (returns null
          locally). Motion / backdrop live on the host; no local AnimatePresence. */}
      {isIncomingMode && incomingView === 'pos' && incomingDetails ? (
        <IncomingDetailsPanel
          zohoPurchaseOrderId={incomingDetails.poId}
          poNumberHint={incomingDetails.poNumber}
          shipmentId={incomingDetails.shipmentId}
          inboundSourceType={incomingDetails.inboundSourceType}
          inboundSourceOrderId={incomingDetails.inboundSourceOrderId}
          onClose={onCloseIncoming}
        />
      ) : null}

      {/* Bulk-selection action bar — pins to the bottom of the list region when
          rows are selected in History / Incoming-POS (never over Email Triage). */}
      {showTable ? (
        <ContextualSelectionBar
          scope={RECEIVING_SELECTION_SCOPE}
          rows={selectedRows}
          actions={bulkActions}
        />
      ) : null}
    </RightPaneOverlayHost>
  );
}
