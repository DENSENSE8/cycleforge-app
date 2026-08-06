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

import { useRef } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { ReceivingLineWorkspace } from '@/components/receiving/workspace/ReceivingLineWorkspace';
import { ReceivingWorkspaceSkeleton } from '@/components/receiving/workspace/ReceivingWorkspaceSkeleton';
import { UnboxWorkspaceView } from '@/components/receiving/unbox/UnboxWorkspaceView';
import { UnboxLookupReceipt } from '@/components/receiving/unbox/UnboxLookupReceipt';
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
  /** History triage slide-over open — suppress batch rail so inspectors don't fight. */
  historyTriageOpen?: boolean;
}

export function UnboxLineWorkspace({
  staffId,
  workspace,
  nav,
  restorePending = false,
  lookupReceipt = null,
  onClearLookupReceipt,
  onCloseWorkspace,
  historyTriageOpen = false,
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
            historyTriageOpen={historyTriageOpen}
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
