'use client';

/**
 * Triage right-pane shell — browse workbench always mounted; focused carton
 * workspace crossfades over it (UnboxLineWorkspace pattern). Uses the heavier
 * `workbenchPaneSettle` preset for carton→carton swaps.
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import { ReceivingLineWorkspace } from '@/components/receiving/workspace/ReceivingLineWorkspace';
import { TriageWorkspaceSkeleton } from '@/components/receiving/triage/TriageWorkspaceSkeleton';
import { TriageWorkspaceView } from '@/components/receiving/triage/TriageWorkspaceView';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasLayoutClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';
import type { ScanIntakeSurface } from '@/lib/receiving/scan';
import type {
  NavState,
  WorkspaceState,
} from '@/components/receiving/useReceivingWorkspacePane';

interface TriageLineWorkspaceProps {
  staffId: string;
  workspace: WorkspaceState | null;
  nav: NavState | null;
  scanInFlight: { tracking: string; startedAt: number; surface: ScanIntakeSurface } | null;
  onCloseWorkspace: () => void;
}

export function TriageLineWorkspace({
  staffId,
  workspace,
  nav,
  scanInFlight,
  onCloseWorkspace,
}: TriageLineWorkspaceProps) {
  const panePresence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneSettle);
  const row = workspace?.row ?? null;
  const showOverlay = !!workspace;
  const showScanLoader =
    !!scanInFlight && scanInFlight.surface === 'triage' && !showOverlay;

  return (
    <div className={cn(appWorkCanvasLayoutClass, 'h-full')}>
      <div
        className={`flex h-full min-h-0 w-full flex-col ${showOverlay ? 'pointer-events-none' : ''}`}
        aria-hidden={showOverlay ? true : undefined}
        inert={showOverlay ? true : undefined}
        style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
      >
        {showScanLoader ? (
          <TriageWorkspaceSkeleton />
        ) : (
          <TriageWorkspaceView selectedLine={row} />
        )}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {showOverlay && workspace ? (
          <motion.div
            key={
              workspace.scanDriven
                ? `scan-${workspace.row.client_event_id ?? workspace.row.tracking_number ?? workspace.row.id}`
                : `row-${workspace.row.receiving_id ?? workspace.row.id}`
            }
            initial={panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            <ReceivingLineWorkspace
              row={workspace.row}
              staffId={staffId}
              accordionBootstrap={workspace.accordionBootstrap}
              nav={nav}
              variant="triage"
              // Absent = a path that predates the feed's click-to-open (scan,
              // recent rail, sibling PO line, deep-link restore) — every one of
              // those is a deliberate open of one carton, so it records.
              recordView={workspace.recordView !== false}
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
    </div>
  );
}
