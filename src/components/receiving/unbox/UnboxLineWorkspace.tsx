'use client';

/**
 * Unbox right-pane shell — station-first.
 *
 * - Station (no `?unboxdesk=`): carton overlay OR empty scan shell. Workbench
 *   tables are NOT mounted (including not as a hidden underlay).
 * - Desk (`?unboxdesk=1`): lazy `UnboxWorkspaceView` (Queue / Recent / History).
 *
 * Motion is the STATION cadence preset (`stationCartonSwap`), not the pointer
 * `workbenchPaneSettle` its siblings use. Exit is instant.
 *
 * - Desk→first open: `mode="wait"` + enter fade (~0.12s).
 * - Carton→carton (rail PO switch / next scan): `mode="sync"` + hard-cut enter
 *   (`initial={false}`). The new opaque pane mounts on top while the old one
 *   exits underneath — `mode="wait"` would remove A before mounting B and
 *   punch a white hole through the card host.
 *
 * Remount is deliberately KEPT — it re-seeds the editor cleanly per carton.
 * Overlay shell paints `bg-surface-canvas` to match the station body.
 *
 * The carton instrument (`ReceivingLineWorkspace` / `LineEditPanel`) stays
 * `next/dynamic` so desk JS never pulls the ~1.1k-LOC panel. Desk tables are
 * also dynamic so cold station land never downloads the grid.
 */

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { ReceivingWorkspaceSkeleton } from '@/components/receiving/workspace/ReceivingWorkspaceSkeleton';
import { UnboxStationEmptyShell } from '@/components/receiving/unbox/UnboxStationEmptyShell';
import { UnboxLookupReceipt } from '@/components/receiving/unbox/UnboxLookupReceipt';
import { useUnboxPrimaryPaintOptional } from '@/components/receiving/unbox/unbox-primary-paint-context';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  resolveWorkspacePaneSlot,
  type WorkspacePaneSlot,
} from '@/components/receiving/workspace-pane-key';
import { isUnboxDesk } from '@/lib/receiving/unbox-selection-url';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasLayoutClass } from '@/design-system/tokens/app-surface';
import { AppSurfaceFill, appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';
import type {
  NavState,
  WorkspaceState,
} from '@/components/receiving/useReceivingWorkspacePane';

const ReceivingLineWorkspace = dynamic(
  () =>
    import('@/components/receiving/workspace/ReceivingLineWorkspace').then(
      (m) => m.ReceivingLineWorkspace,
    ),
  { ssr: false, loading: () => <ReceivingWorkspaceSkeleton /> },
);

const UnboxWorkspaceView = dynamic(
  () =>
    import('@/components/receiving/unbox/UnboxWorkspaceView').then(
      (m) => m.UnboxWorkspaceView,
    ),
  { ssr: false, loading: () => <ReceivingWorkspaceSkeleton showHeader={false} /> },
);

interface UnboxLineWorkspaceProps {
  staffId: string;
  workspace: WorkspaceState | null;
  nav: NavState | null;
  /** A deep-link / MRU restore is resolving — show the workspace skeleton. */
  restorePending?: boolean;
  /** Last scan hit an already-unboxed carton — show the read-only receipt over the editor. */
  lookupReceipt?: UnboxLookupScanDetail | null;
  onClearLookupReceipt?: () => void;
  onCloseWorkspace: () => void;
  /**
   * A carton is PICKED in the `detail:history` inspector — suppress the batch
   * rail so two inspectors don't fight for the slot.
   */
  recordInspectOpen?: boolean;
  /**
   * Either inspector state (picked carton OR the View-only shell) — drives the
   * Band 3 toggle's open face. Kept separate from {@link recordInspectOpen}:
   * the View shell has no row selection, so it must not suppress bulk actions.
   */
  inspectorOpen?: boolean;
}

export function UnboxLineWorkspace({
  staffId,
  workspace,
  nav,
  restorePending = false,
  lookupReceipt = null,
  onClearLookupReceipt,
  onCloseWorkspace,
  recordInspectOpen = false,
  inspectorOpen = false,
}: UnboxLineWorkspaceProps) {
  const searchParams = useSearchParams();
  const desk = isUnboxDesk(searchParams);

  // `motionRole.swap.scan` — the station-cadence swap, carried as one pair so
  // the carton→carton exit can never drift off its zero-duration contract.
  const { presence: panePresence, transition: paneTransition } = useMotionRole(
    motionRole.swap.scan,
  );
  const row = workspace?.row ?? null;
  const showOverlay = !!workspace;
  // Deep-link / MRU restore: carton fetch in flight — skeleton, never desk sheet.
  const showRestoreSkeleton = restorePending && !showOverlay;

  // Overlay presence identity — ONE key per physical carton (see
  // `workspace-pane-key.ts`). Advanced from a ref DURING render because the key
  // is needed at render time; `resolveWorkspacePaneSlot` is idempotent under
  // repeated application, so StrictMode's double-invoke is a no-op. Reset on
  // close so a fresh open never inherits a stale slot.
  const paneSlotRef = useRef<WorkspacePaneSlot | null>(null);
  paneSlotRef.current =
    showOverlay && workspace ? resolveWorkspacePaneSlot(paneSlotRef.current, workspace.row) : null;
  const paneKey = paneSlotRef.current?.key ?? 'carton:none';

  // Carton→carton while the overlay is already open: sync + hard-cut so the
  // new opaque pane covers the old one — `mode="wait"` would uncover the host
  // between exit and enter. Desk→first open still uses wait + enter fade.
  const overlayWasOpenRef = useRef(false);
  const cartonSwapHardCut = showOverlay && overlayWasOpenRef.current;
  overlayWasOpenRef.current = showOverlay;

  // Read-only "already unboxed" receipt — shown over the editor when THIS
  // carton is the one the lookup scan resolved to. Scoped by carton id so a
  // stale receipt can never sit over a different box.
  const showLookupReceipt =
    !!lookupReceipt && !!row && lookupReceipt.receivingId === row.receiving_id;

  // Release SSR stand-in only for a settled empty bench (no MRU). Carton opens
  // signal from ReceivingLineWorkspace after the middle chunk mounts — never
  // hand LCP to restore skeleton / pulse bars / Browse CTA.
  const unboxPrimaryPaint = useUnboxPrimaryPaintOptional();
  useEffect(() => {
    if (!unboxPrimaryPaint) return;
    if (!desk && !showOverlay && !showRestoreSkeleton) {
      unboxPrimaryPaint.onPrimaryPainted();
    }
  }, [unboxPrimaryPaint, showOverlay, showRestoreSkeleton, desk]);

  // Desk underlay only when explicitly on desk AND no carton overlay.
  const showDesk = desk && !showOverlay && !showRestoreSkeleton;

  return (
    <div className={cn(appWorkCanvasLayoutClass, 'h-full')}>
      <div
        className={`flex h-full min-h-0 w-full flex-col ${showOverlay ? 'pointer-events-none' : ''}`}
        aria-hidden={showOverlay ? true : undefined}
        inert={showOverlay ? true : undefined}
        style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
      >
        {showRestoreSkeleton ? (
          <ReceivingWorkspaceSkeleton />
        ) : showDesk ? (
          <UnboxWorkspaceView
            selectedLine={row}
            recordInspectOpen={recordInspectOpen}
            inspectorOpen={inspectorOpen}
          />
        ) : !showOverlay ? (
          <UnboxStationEmptyShell />
        ) : null}
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
            <ReceivingLineWorkspace
              row={workspace.row}
              staffId={staffId}
              accordionBootstrap={workspace.accordionBootstrap}
              nav={nav}
              variant="unbox"
              // Absent = a path that predates the feed's click-to-open (scan,
              // recent rail, sibling PO line, deep-link restore) — every one of
              // those is a deliberate open of one carton, so it records.
              recordView={workspace.recordView !== false}
              onPrev={() => {
                emitReceiving('receiving-navigate-table', 'prev');
              }}
              onNext={() => {
                emitReceiving('receiving-navigate-table', 'next');
              }}
              onClose={onCloseWorkspace}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
