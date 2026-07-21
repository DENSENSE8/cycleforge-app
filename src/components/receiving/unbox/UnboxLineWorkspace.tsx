'use client';

/**
 * Unbox right-pane shell — browse workbench always mounted; focused line
 * workspace crossfades over it (TestingLineWorkspace pattern). Uses the heavier
 * `workbenchPaneSettle` preset for carton→carton swaps (Receiving convention).
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ReceivingLineWorkspace } from '@/components/receiving/workspace/ReceivingLineWorkspace';
import { ReceivingWorkspaceSkeleton } from '@/components/receiving/workspace/ReceivingWorkspaceSkeleton';
import { UnboxWorkspaceView } from '@/components/receiving/unbox/UnboxWorkspaceView';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';
import type {
  NavState,
  WorkspaceState,
} from '@/components/receiving/useReceivingWorkspacePane';

interface UnboxLineWorkspaceProps {
  staffId: string;
  workspace: WorkspaceState | null;
  nav: NavState | null;
  /** A deep-link restore is resolving — show the workspace skeleton, not browse. */
  restorePending?: boolean;
  onCloseWorkspace: () => void;
}

export function UnboxLineWorkspace({
  staffId,
  workspace,
  nav,
  restorePending = false,
  onCloseWorkspace,
}: UnboxLineWorkspaceProps) {
  const panePresence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneSettle);
  const row = workspace?.row ?? null;
  const showOverlay = !!workspace;
  // Deep-link load (`?openReceivingId=`): the carton is being fetched but the
  // overlay is not open yet. Show the workspace skeleton in the underlay so a
  // refresh never flashes the browse feed before the restore lands.
  const showRestoreSkeleton = restorePending && !showOverlay;

  return (
    <div className={cn(appWorkCanvasClass, 'h-full')}>
      <div
        className={`flex h-full min-h-0 w-full flex-col ${showOverlay ? 'pointer-events-none' : ''}`}
        aria-hidden={showOverlay ? true : undefined}
        inert={showOverlay ? true : undefined}
        style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
      >
        {showRestoreSkeleton ? (
          <ReceivingWorkspaceSkeleton />
        ) : (
          <UnboxWorkspaceView selectedLine={row} />
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
              variant="unbox"
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
