'use client';

/**
 * Triage right-pane shell — browse (empty / scan skeleton) always mounted;
 * focused carton workspace crossfades over it (UnboxLineWorkspace pattern).
 * Uses the heavier `workbenchPaneSettle` preset for carton→carton swaps.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { EmptyState } from '@/design-system/primitives';
import { ReceivingLineWorkspace } from '@/components/receiving/workspace/ReceivingLineWorkspace';
import { TriageWorkspaceSkeleton } from '@/components/receiving/triage/TriageWorkspaceSkeleton';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import type { ScanIntakeSurface } from '@/lib/receiving/scan';
import type {
  NavState,
  WorkspaceState,
} from '@/components/receiving/useReceivingWorkspacePane';

const TRIAGE_EMPTY = {
  title: 'No carton selected',
  description:
    'Pick a carton from the Unfound or Prioritize list, or scan a tracking number to triage it.',
} as const;

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
  const showOverlay = !!workspace;
  const showScanLoader =
    !!scanInFlight && scanInFlight.surface === 'triage' && !showOverlay;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-canvas">
      <div
        className={`flex h-full min-h-0 w-full flex-col ${showOverlay ? 'pointer-events-none' : ''}`}
        aria-hidden={showOverlay ? true : undefined}
        inert={showOverlay ? true : undefined}
        style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
      >
        {showScanLoader ? (
          <TriageWorkspaceSkeleton />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState title={TRIAGE_EMPTY.title} description={TRIAGE_EMPTY.description} />
          </div>
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
