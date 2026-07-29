'use client';

/**
 * Unbox right-pane shell — browse workbench always mounted; focused line
 * workspace crossfades over it (TestingLineWorkspace pattern).
 *
 * Motion is the STATION cadence preset (`stationCartonSwap`), not the pointer
 * `workbenchPaneSettle` its siblings use: the exit is instant and only the
 * enter fades (~0.12s), so scanning the next box no longer costs ~0.6s of empty
 * canvas. The remount is deliberately KEPT — it is what guarantees the editor
 * re-seeds cleanly per carton (see the note on in-place swaps below).
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
 * The remount is what guarantees a clean re-seed. Killing the *animation*
 * (above) buys the throughput without taking that risk; removing the *remount*
 * needs those resets first.
 */

import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ReceivingLineWorkspace } from '@/components/receiving/workspace/ReceivingLineWorkspace';
import { ReceivingWorkspaceSkeleton } from '@/components/receiving/workspace/ReceivingWorkspaceSkeleton';
import { UnboxWorkspaceView } from '@/components/receiving/unbox/UnboxWorkspaceView';
import { UnboxLookupReceipt } from '@/components/receiving/unbox/UnboxLookupReceipt';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import {
  resolveWorkspacePaneSlot,
  type WorkspacePaneSlot,
} from '@/components/receiving/workspace-pane-key';
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
  const panePresence = useMotionPresence(framerPresence.stationCartonSwap);
  const paneTransition = useMotionTransition(framerTransition.stationCartonSwapMount);
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

  // Read-only "already unboxed" receipt — shown over the editor when THIS
  // carton is the one the lookup scan resolved to. Scoped by carton id so a
  // stale receipt can never sit over a different box.
  const showLookupReceipt =
    !!lookupReceipt && !!row && lookupReceipt.receivingId === row.receiving_id;

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
            key={paneKey}
            initial={panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            {showLookupReceipt && lookupReceipt ? (
              // Covers the editor rather than replacing it, so "Open anyway" is
              // instant (dismiss the cover) and the editor never re-mounts.
              <div className="absolute inset-0 z-10 bg-surface-canvas">
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
