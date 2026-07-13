'use client';

/**
 * The `/receiving` right-pane column. The History/Incoming table stays mounted
 * (display-toggled) so its cache + scroll survive tab flips; over it the focused
 * line workspace crossfades in, a scan-in-flight skeleton covers the lookup gap,
 * a per-mode empty state shows when nothing is open, and the Incoming details
 * slide-over opens on a row select. Pure presentational; state + handlers come
 * from the dashboard's hooks. Extracted from ReceivingDashboard; behaviour is
 * unchanged.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import ReceivingLinesTable from '@/components/station/ReceivingLinesTable';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/ReceivingLinesTable';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { EmptyState } from '@/design-system/primitives';
import { ReceivingLineWorkspace } from '@/components/receiving/workspace/ReceivingLineWorkspace';
import { ReceivingWorkspaceSkeleton } from '@/components/receiving/workspace/ReceivingWorkspaceSkeleton';
import { TriageWorkspaceSkeleton } from '@/components/receiving/triage/TriageWorkspaceSkeleton';
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

/**
 * Right-pane empty state per sidebar mode. Keyed by `?mode=` so each mode's copy
 * is structurally tied to that mode (triage's "pick from the Unfound/Prioritize
 * list" prompt is meaningless in Unbox, and vice versa). Modes without an entry
 * (history / incoming are table-only; pickup early-returns) render none.
 */
const RECEIVING_EMPTY_STATE: Partial<Record<string, { title: string; description: string }>> = {
  triage: {
    title: 'No carton selected',
    description:
      'Pick a carton from the Unfound or Prioritize list, or scan a tracking number to triage it.',
  },
};

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
  staffId,
  incomingDetails,
  onCloseIncoming,
  onCloseWorkspace,
}: ReceivingRightPaneProps) {
  const showWorkspace = !!workspace && !isTableOnlyMode;
  // Scan loader covers the gap between scan and PO/line mounting, rendered above
  // the workspace (z-20) so it overlays the previously-open line. Each mode gets
  // its OWN skeleton loader — never the other mode's display — gated on the
  // surface the in-flight scan belongs to (`scanInFlight.surface`). Unbox → the
  // LineEditPanel-shaped ReceivingWorkspaceSkeleton; Triage → the TriagePanel-
  // shaped TriageWorkspaceSkeleton. A scan in one mode can never paint the other
  // mode's pane. There is no "Finding your PO" hero — the skeleton is the loader.
  const showUnboxScanLoader =
    !!scanInFlight && scanInFlight.surface === 'unbox' && !isTableOnlyMode && !isTriageMode;
  const showTriageScanLoader =
    !!scanInFlight && scanInFlight.surface === 'triage' && isTriageMode;
  const emptyState = RECEIVING_EMPTY_STATE[mode];
  const showIdleSkeleton = mode === 'receive' && !isTableOnlyMode && !showWorkspace && !showUnboxScanLoader;
  // Heavy line-workspace overlay crossfade. Uses the slower, opacity-led
  // `workbenchPaneSettle` (not the snappy `workbenchPane`): a carton→carton swap
  // dissolves — the incoming pane rises + fades in over a static, fading-out
  // outgoing pane, so two full-bleed panes never slide in opposite directions
  // (the old double-image jitter). The hook collapses it to opacity-only under
  // prefers-reduced-motion (no local branching).
  // Key on table-only vs workspace mode so a flip to History/Incoming OR between
  // Triage/Unbox remounts the presence host — the exiting panel is torn down
  // immediately instead of crossfading for ~300ms over the now-visible surface
  // (the bleed). Including `mode` prevents TriagePanel ↔ LineEditPanel ghosting.
  const workspacePresenceKey = isTableOnlyMode ? 'table-only' : `workspace-${mode}`;
  const workspacePane = useMotionPresence(framerPresence.workbenchPaneSettle);
  const workspaceTransition = useMotionTransition(
    isTableOnlyMode ? { duration: 0 } : framerTransition.workbenchPaneSettle,
  );
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

  return (
    <RightPaneOverlayHost className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* History/Incoming-POS table — always mounted to keep its react-query
          cache, in-progress search results, and scroll position alive across tab
          flips. Hidden (not unmounted) in Receiving so the auto-select /
          first-mount effects don't re-fire on every close. The Incoming view
          toggle now lives in the sidebar; this pane renders the chosen sub-view
          full-bleed. */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ display: showTable ? 'block' : 'none' }}
        aria-hidden={!showTable}
      >
        <ReceivingLinesTable selectMode={selectMode} />
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

      {/* Idle Unbox right pane — workspace-shaped skeleton instead of empty copy. */}
      {showIdleSkeleton ? (
        <div className="absolute inset-0 overflow-hidden">
          <ReceivingWorkspaceSkeleton />
        </div>
      ) : null}

      {/* Empty right pane — per-mode copy from RECEIVING_EMPTY_STATE. Sits under
          the workspace/loader overlays (no z), so it only shows when neither is
          mounted. */}
      {!isTableOnlyMode && !showWorkspace && !showUnboxScanLoader && !showTriageScanLoader && !showIdleSkeleton && emptyState ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <EmptyState
            title={emptyState.title}
            description={emptyState.description}
          />
        </div>
      ) : null}

      {/* Unbox scan-in-flight skeleton — shown the moment an unbox tracking scan
          is submitted; cleared 500ms after the response lands. With a workspace
          already mounted behind, start BELOW its 80px header chrome (40px stepper
          + 40px toolbar) and drop the skeleton's own header so those rows stay
          visible. Cold start fills from the top with the full skeleton. */}
      {showUnboxScanLoader ? (
        <div
          className={`absolute inset-x-0 bottom-0 z-20 overflow-hidden ${
            showWorkspace ? 'top-[80px]' : 'top-0'
          }`}
        >
          <ReceivingWorkspaceSkeleton showHeader={!showWorkspace} />
        </div>
      ) : null}

      {/* Triage scan-in-flight skeleton — triage's OWN skeleton (TriagePanel-
          shaped), full-bleed so it cleanly takes over the triage pane while the
          carton is being identified. Never renders the unbox display. */}
      {showTriageScanLoader ? (
        <div className="absolute inset-0 z-20 overflow-hidden">
          <TriageWorkspaceSkeleton />
        </div>
      ) : null}

      {/* Workspace — overlays everything when a line is active in Receiving. */}
      <AnimatePresence initial={false} key={workspacePresenceKey}>
        {showWorkspace ? (
          <motion.div
            // Key on the CARTON, not the line. Switching between sibling lines of
            // the same carton (receiving_id) must NOT remount/crossfade the whole
            // workspace — only a carton→carton change should. The controller
            // re-seeds per-line state on row.id change in place, so an in-place
            // line switch is both faster and more correct (carton-level PO#,
            // tracking, photos stay put). Fall back to the line id for rows with
            // no carton yet (pre-carton stub).
            key={`workspace-${workspace!.row.receiving_id ?? `line-${workspace!.row.id}`}`}
            initial={workspacePane.initial}
            animate={workspacePane.animate}
            exit={workspacePane.exit}
            transition={workspaceTransition}
            className="absolute inset-0 z-10"
          >
            {/* Unbox and Triage are de-coupled panels (LineEditPanel /
                TriagePanel), selected by variant inside ReceivingLineWorkspace —
                each declares its own sections; no shared capability matrix. */}
            <ReceivingLineWorkspace
              row={workspace!.row}
              staffId={staffId}
              accordionBootstrap={workspace!.accordionBootstrap}
              nav={nav}
              variant={isTriageMode ? 'triage' : 'unbox'}
              onPrev={() => {
                window.dispatchEvent(
                  new CustomEvent('receiving-navigate-table', { detail: 'prev' }),
                );
              }}
              onNext={() => {
                window.dispatchEvent(
                  new CustomEvent('receiving-navigate-table', { detail: 'next' }),
                );
              }}
              onClose={onCloseWorkspace}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Incoming details panel — right slide-over. A stable key keeps it mounted
          as rows flip so only the contents swap. */}
      <AnimatePresence initial={false}>
        {isIncomingMode && incomingView === 'pos' && incomingDetails ? (
          <IncomingDetailsPanel
            key="incoming-details-panel"
            zohoPurchaseOrderId={incomingDetails.poId}
            poNumberHint={incomingDetails.poNumber}
            shipmentId={incomingDetails.shipmentId}
            inboundSourceType={incomingDetails.inboundSourceType}
            inboundSourceOrderId={incomingDetails.inboundSourceOrderId}
            onClose={onCloseIncoming}
          />
        ) : null}
      </AnimatePresence>

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
