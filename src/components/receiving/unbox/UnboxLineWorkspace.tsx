'use client';

/**
 * Unbox right-pane shell — browse workbench always mounted; focused line
 * workspace crossfades over it (TestingLineWorkspace pattern).
 *
 * Motion is the STATION cadence preset (`stationCartonSwap`), not the pointer
 * `workbenchPaneSettle` its siblings use. Exit is instant.
 *
 * - Browse→first open: `mode="wait"` + enter fade (~0.12s).
 * - Carton→carton (rail PO switch / next scan): `mode="sync"` + hard-cut enter
 *   (`initial={false}`). The new opaque pane mounts on top while the old one
 *   exits underneath — `mode="wait"` would remove A before mounting B and
 *   punch a white hole through the card host while the underlay stays
 *   `visibility: hidden`. Concurrent *semi-transparent* fades still
 *   double-image; opaque cover-replace does not.
 *
 * Remount is deliberately KEPT — it re-seeds the editor cleanly per carton
 * (see in-place swap note below). Overlay shell paints `bg-surface-canvas`
 * to match the station body (not card white).
 *
 * The crossfade is keyed on CARTON identity (`workspace-pane-key.ts`), not on
 * how the carton was opened. A scan landing on a different box still remounts
 * the shell; the scan-resolution upgrade (pending stub → matched → hydrated)
 * and a scan→rail-click of the SAME box reconcile in place.
 *
 * DO NOT go further and swap carton→carton IN PLACE (the queue-inspector
 * exception in `display/motion-crossfade.md`). That exception has stated
 * preconditions and `LineEditPanel` does not meet them today: `unboxView`,
 * `classifyExpand`, and `pairingOpen` have no reset keyed on `row.id`, so an
 * in-place carton swap would carry the open tab and sub-form across two
 * different boxes — and the notes composer's dirty draft has no
 * flush-before-swap, which is exactly how one carton's note lands on another.
 * The remount is what guarantees a clean re-seed. Sync + opaque cover-replace
 * buys zero-flash rail switches without taking that risk; removing the
 * *remount* needs those resets first.
 */

import { useEffect, useRef } from 'react';
// useRef also gates the render-time primary-paint release below
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { ReceivingWorkspaceSkeleton } from '@/components/receiving/workspace/ReceivingWorkspaceSkeleton';

// Phase 2 (lazy carton graph): `ReceivingLineWorkspace` pulls the ~1.1k-LOC
// `LineEditPanel` + the whole Displays registry — the heaviest module on
// `/unbox`. Keep the chunk split via `next/dynamic`, but do NOT opt out of SSR:
// station-first cold land opens the MRU carton on bare `/unbox`, and that
// workspace is the route's declared LCP surface. `ssr: false` left a blank
// middle until hydration (~7s). Desk tables (`UnboxWorkspaceView`) stay
// `ssr: false` — they only mount behind `?unboxdesk=1`.
const ReceivingLineWorkspace = dynamic(
  () =>
    import('@/components/receiving/workspace/ReceivingLineWorkspace').then(
      (m) => m.ReceivingLineWorkspace,
    ),
  { loading: () => <ReceivingWorkspaceSkeleton /> },
);
const UnboxWorkspaceView = dynamic(
  () =>
    import('@/components/receiving/unbox/UnboxWorkspaceView').then(
      (m) => m.UnboxWorkspaceView,
    ),
  { ssr: false, loading: () => <ReceivingWorkspaceSkeleton /> },
);
import { UnboxPreviewLock } from './UnboxPreviewLock';
import { UnboxLookupReceipt } from '@/components/receiving/unbox/UnboxLookupReceipt';
import { useUnboxPrimaryPaintOptional } from '@/components/receiving/unbox/unbox-primary-paint-context';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';
import { emitReceiving } from '@/components/receiving/receiving-events';
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
  // between exit and enter. Browse→first open still uses wait + enter fade.
  const overlayWasOpenRef = useRef(false);
  const cartonSwapHardCut = showOverlay && overlayWasOpenRef.current;
  overlayWasOpenRef.current = showOverlay;

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
        ) : (
          <UnboxWorkspaceView
            selectedLine={row}
            recordInspectOpen={recordInspectOpen}
            inspectorOpen={inspectorOpen}
          />
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
            {/* Preview makes the whole plane inert rather than threading a
                `readOnly` prop through ~40 controls: one missed control would
                be a silent write from the stance whose contract is not
                writing. `inert` also takes it out of the tab order, so the
                wedge cannot land in a field that will never save. */}
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
              nav={nav}
              variant="unbox"
              // Absent = a path that predates the feed's click-to-open (scan,
              // recent rail, sibling PO line, deep-link restore) — every one of
              // those is a deliberate open of one carton, so it records.
              recordView={!workspace.preview && workspace.recordView !== false}
              onPrev={() => {
                emitReceiving('receiving-navigate-table', 'prev');
              }}
              onNext={() => {
                emitReceiving('receiving-navigate-table', 'next');
              }}
              onClose={onCloseWorkspace}
            />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
