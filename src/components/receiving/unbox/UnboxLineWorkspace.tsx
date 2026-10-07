'use client';

/** Unbox right-pane shell — the browse workbench mounts the first time it is shown, then stays mounted; the focused line workspace crossfades over it (TestingLineWorkspace pattern). */

import { useEffect, useRef, useState } from 'react';
// useRef carries the render-time pane slot below (see `paneSlotRef`)
import dynamic from 'next/dynamic';
import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { loadReceivingLineWorkspace } from '@/components/receiving/workspace/receiving-line-workspace-loader';
import { StationWorkspaceSkeleton } from '@/components/station/workbench';

const ReceivingLineWorkspace = dynamic(
  () => loadReceivingLineWorkspace().then((m) => m.ReceivingLineWorkspace),
  { ssr: false, loading: () => <StationWorkspaceSkeleton body="unbox-overview" /> },
);

const UnboxWorkspaceView = dynamic(
  () =>
    import('@/components/receiving/unbox/UnboxWorkspaceView').then(
      (m) => m.UnboxWorkspaceView,
    ),
  { ssr: false },
);
import { UnboxPreviewLock } from './UnboxPreviewLock';
import { UnboxLookupReceipt } from '@/components/receiving/unbox/UnboxLookupReceipt';
import { useUnboxPrimaryPaintOptional } from '@/components/receiving/unbox/unbox-primary-paint-context';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';
import {
  resolveWorkspacePaneSlot,
  type WorkspacePaneSlot,
} from '@/components/receiving/workspace-pane-key';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasLayoutClass } from '@/design-system/tokens/app-surface';
import { AppSurfaceFill, appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
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
  /** Last scan hit an already-unboxed carton — show the read-only receipt over the editor. */
  lookupReceipt?: UnboxLookupScanDetail | null;
  onClearLookupReceipt?: () => void;
  onCloseWorkspace: () => void;
}

export function UnboxLineWorkspace({
  staffId,
  workspace,
  nav,
  restorePending = false,
  lookupReceipt = null,
  onClearLookupReceipt,
  onCloseWorkspace,
}: UnboxLineWorkspaceProps) {
  // `motionRole.swap.scan` — the station-cadence swap, carried as one pair so
  // the carton→carton exit can never drift off its zero-duration contract.
  const { presence: panePresence, transition: paneTransition } = useMotionRole(
    motionRole.swap.scan,
  );
  const row = workspace?.row ?? null;
  const showOverlay = !!workspace;
  // Deep-link load (`?openReceivingId=`): the carton is being fetched but the
  // overlay is not open yet. Show the workspace skeleton in the underlay so a
  // refresh never flashes the browse feed before the restore lands.
  const showRestoreSkeleton = restorePending && !showOverlay;

  // Overlay presence identity — ONE key per physical carton (see `workspace-pane-key.ts`).
  const paneSlotRef = useRef<WorkspacePaneSlot | null>(null);
  paneSlotRef.current =
    showOverlay && workspace ? resolveWorkspacePaneSlot(paneSlotRef.current, workspace.row) : null;
  const paneKey = paneSlotRef.current?.key ?? 'carton:none';

  // Carton→carton while the overlay is already open:
  const cartonSwapHardCut = useOverlaySwapHardCut(showOverlay);

  // Read-only "already unboxed" receipt — shown over the editor when THIS
  // carton is the one the lookup scan resolved to. Scoped by carton id so a
  // stale receipt can never sit over a different box.
  const showLookupReceipt =
    !!lookupReceipt && !!row && lookupReceipt.receivingId === row.receiving_id;

  // Carton open / deep-link restore owns the centre — release the Queue SSR
  // stand-in so it never covers the station workspace. Seeded cold land also
  // starts `UnboxBrowseShell` ready (see shell `cacheHasSeededCarton`).
  const unboxPrimaryPaint = useUnboxPrimaryPaintOptional();
  useEffect(() => {
    if (!unboxPrimaryPaint) return;
    if (showOverlay || showRestoreSkeleton) {
      unboxPrimaryPaint.onPrimaryPainted();
    }
  }, [unboxPrimaryPaint, showOverlay, showRestoreSkeleton]);

  // The desk (the full receiving grid) under an open carton is invisible, yet
  // rendering it on a cold load with a carton open was the page's biggest
  // main-thread cost. It mounts the first time the middle actually shows it,
  // then stays mounted so later back-to-list is instant.
  const [deskMounted, setDeskMounted] = useState(!showOverlay);
  if (!deskMounted && !showOverlay) setDeskMounted(true);

  return (
    /* The outer shell wraps BOTH the desk pane and the carton overlay. */
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
    <div className={cn(appWorkCanvasLayoutClass, 'h-full')}>
      <div
        className={`flex h-full min-h-0 w-full flex-col ${showOverlay ? 'pointer-events-none' : ''}`}
        aria-hidden={showOverlay ? true : undefined}
        inert={showOverlay ? true : undefined}
        style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
      >
        {showRestoreSkeleton || !deskMounted ? null : (
          <UnboxWorkspaceView selectedLine={row} />
        )}
      </div>

      {/* Defensive canvas plate under the keyed overlay — matches station fill
          so any residual gap is not card white. Primary zero-flash contract is
          sync + opaque cover-replace on carton→carton (below). */}
      {showOverlay ? (
        <AppSurfaceFill
          tone="canvas"
          style={{ zIndex: zIndex.panel }}
          data-testid="unbox-overlay-plate"
        />
      ) : null}

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
            // Entering sibling stacks above the exiting one under sync.
            style={{ zIndex: zIndex.panel + (cartonSwapHardCut ? 1 : 0) }}
            className={cn('absolute inset-0 flex min-h-0 flex-col', appSurfaceFillClass('canvas'))}
          >
            {workspace.preview ? (
              // Read-only lease: the band names the stance, and `inert` on the
              // body below is what actually enforces it.
              <UnboxPreviewLock onDismiss={onCloseWorkspace} />
            ) : null}
            {showLookupReceipt && lookupReceipt ? (
              // Covers the editor rather than replacing it, so "Open anyway" is
              // instant (dismiss the cover) and the editor never re-mounts.
              <div className={cn('absolute inset-0 z-10', appSurfaceFillClass('canvas'))}>
                <UnboxLookupReceipt
                  receipt={lookupReceipt}
                  unboxedByName={workspace.row.unboxed_by_name ?? null}
                  onOpenAnyway={() => onClearLookupReceipt?.()}
                  onDismiss={() => {
                    onClearLookupReceipt?.();
                    onCloseWorkspace();
                  }}
                />
              </div>
            ) : null}
            {/* Preview makes the whole plane inert rather than threading a `readOnly` prop through ~40 controls: */}
            <div
              className="flex min-h-0 flex-1 flex-col"
              // Stable hook for the read-only E2E: the assertion has to name
              // the plane that carries `inert`, not infer it from a sibling.
              data-unbox-preview-plane={workspace.preview ? '' : undefined}
              inert={workspace.preview ? true : undefined}
            >
            <ReceivingLineWorkspace
              row={workspace.row}
              staffId={staffId}
              accordionBootstrap={workspace.accordionBootstrap}
              scanDriven={workspace.scanDriven}
              nav={nav}
              variant="unbox"
              // Absent = a path that predates the feed's click-to-open (scan,
              // recent rail, sibling PO line, deep-link restore) — every one of
              // those is a deliberate open of one carton, so it records.
              recordView={!workspace.preview && workspace.recordView !== false}
              onClose={onCloseWorkspace}
            />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
    </div>
  );
}
