'use client';

/**
 * Triage right-pane shell — browse workbench always mounted; focused carton
 * workspace crossfades over it (UnboxLineWorkspace pattern).
 *
 * Motion is the STATION cadence preset (`motionRole.swap.scan`), not the pointer
 * `workbenchPaneSettle`. Exit is instant.
 *
 * - Browse→first open: `mode="wait"` + enter fade (~0.12s).
 * - Carton→carton (next scan): `mode="sync"` + hard-cut enter so the new opaque
 *   pane covers the old one — `mode="wait"` would punch a hole through the host.
 */

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { TriageWorkspaceSkeleton } from '@/components/receiving/triage/TriageWorkspaceSkeleton';

// Phase 2 (lazy carton graph): `TriageLineWorkspace` is a co-mounted sibling of
// `UnboxLineWorkspace` under `ReceivingRightPane`, so its static import of the
// carton graph would drag the ~1.1k-LOC `LineEditPanel` back into the `/unbox`
// (and arrival) browse bundle even after the Unbox path went dynamic. Split it
// here too. Both siblings target the SAME `ReceivingLineWorkspace` specifier, so
// Next dedupes to ONE lazy chunk fetched on the first carton open on either
// surface. Mount stays gated on `showOverlay && workspace`; the loading fallback
// is the triage skeleton (restore/deep-link), never a pulse-bar on browse.
const ReceivingLineWorkspace = dynamic(
  () =>
    import('@/components/receiving/workspace/ReceivingLineWorkspace').then(
      (m) => m.ReceivingLineWorkspace,
    ),
  { ssr: false, loading: () => <TriageWorkspaceSkeleton /> },
);
import { TriageWorkspaceView } from '@/components/receiving/triage/TriageWorkspaceView';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasLayoutClass } from '@/design-system/tokens/app-surface';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
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
  const { presence: panePresence, transition: paneTransition } = useMotionRole(
    motionRole.swap.scan,
  );
  const row = workspace?.row ?? null;
  const showOverlay = !!workspace;
  const showScanLoader =
    !!scanInFlight && scanInFlight.surface === 'triage' && !showOverlay;

  const overlayWasOpenRef = useRef(false);
  const cartonSwapHardCut = showOverlay && overlayWasOpenRef.current;
  overlayWasOpenRef.current = showOverlay;

  const paneKey = workspace
    ? workspace.scanDriven
      ? `scan-${workspace.row.client_event_id ?? workspace.row.tracking_number ?? workspace.row.id}`
      : `row-${workspace.row.receiving_id ?? workspace.row.id}`
    : 'carton:none';

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

      <AnimatePresence
        initial={false}
        mode={cartonSwapHardCut ? 'sync' : 'wait'}
      >
        {showOverlay && workspace ? (
          <motion.div
            key={paneKey}
            initial={cartonSwapHardCut ? false : panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel + (cartonSwapHardCut ? 1 : 0) }}
            className={cn(
              'absolute inset-0 flex min-h-0 flex-col',
              appSurfaceFillClass('chrome'),
            )}
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
              onClose={onCloseWorkspace}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
