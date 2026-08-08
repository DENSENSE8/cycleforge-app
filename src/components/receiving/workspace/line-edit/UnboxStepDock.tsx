'use client';

/**
 * The dock's LEADING zone — the active step's action control.
 *
 * ## The card reads; the dock acts (ruled 2026-08-02)
 *
 * A procedure step card carries no action button. Whatever the operator clicks
 * to advance the step renders here and swaps as the pointer moves. On a photo
 * step that is the camera and `Link a photo`; on `label` it is *Face is right*;
 * on `condition` it is the grade chips.
 *
 * Two reasons, and the second is the one that is easy to miss:
 *
 *   1. **The hand is already here.** The composer, the pager and the
 *      Print · Receive terminal are in this band. A control in a card asks the
 *      operator to leave the one place they never leave.
 *   2. **A card scrolls; the dock does not.** The deck is content inside the
 *      station's scroll port, so a control in a card sits at whatever offset the
 *      deck happens to be at — including under the dock itself, which is exactly
 *      how the label preview came to slide beneath the composer before it became
 *      a step. A control whose position depends on scroll is a control you have
 *      to look for.
 *
 * ## IN the dock — which is now only this and the terminal (2026-08-02)
 *
 * This mounted as its own row floating above the note composer until the
 * operator looked at it: a pill and a link on bare canvas, reading as chrome
 * that belonged to nothing. Two moves followed, in one session at the bench —
 * first into the composer's own footer strip, then the composer came out of the
 * Unbox band entirely. What is left is the dock this docblock always described:
 * the active step's CTA leading, the carton's Print · Receive terminal
 * trailing, inside one `Panel`.
 *
 * Two consequences, both load-bearing:
 *
 *   • **It costs the band no row of its own**, so it needs no clearance
 *     variant. Two were added for taller compositions during that session
 *     (`…STEP_ACTION…`, `…STEP_CUE…`) and both were deleted with the rows they
 *     measured.
 *   • **The controls dropped their prose prompts.** A sentence reads as
 *     instruction copy on a canvas and as clutter in a control strip, and the
 *     deck's own active row names the step directly above. The prompt survives
 *     as each control's accessible label, so a screen reader still hears it.
 *
 * ## It does not re-open the cross-region ban
 *
 * `station-workbench.md` bans a control in one region re-labelling a control in
 * ANOTHER — the Displays column on the right edge rewriting the bottom button.
 * The active step is set in the column **directly above** this band: same
 * region, adjacent, and it is the operator's current work. What that ban
 * protects is that the COMMIT stays unambiguous, and it does — the trailing
 * terminal is carton-scoped and Receive means the same thing on every step.
 *
 * ## Honest absence
 *
 * A step with no dock entry renders nothing at all — not a disabled button, not
 * an empty frame. `arrival_check` reads the door's evidence and must not offer a
 * camera. See `UNBOX_STEPS_WITHOUT_DOCK_ACTION`. `classify` mounts the shared
 * editor via `classifySlot` (Band 1 grows for that step only).
 *
 * ## Motion and focus
 *
 * Crossfades on `activeKey` with `motionRole.swap.scan` — the station-cadence
 * preset with the `duration: 0` exit, not `swap.focus`. This is a scan bench: a
 * 300ms settle between steps is 300ms of empty band while the operator is
 * already reaching. The TRAILING terminal is outside this presence and never
 * animates; it is the one thing on screen that must not move while a hand is
 * going for it.
 */

import { AnimatePresence, motion, useMotionRole, motionRole } from '@/design-system/motion';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import { UnboxDockScanEntry } from './UnboxDockScanEntry';
import { UNBOX_STEP_DOCK_CONTROLS } from './steps/dock';
import { cn } from '@/utils/_cn';
import type { UnboxStepDockContext } from './steps/dock';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ReactNode } from 'react';

export function UnboxStepDock({
  row,
  staffId,
  conditionSlot,
  itemPhotoSlot,
  serialSlot,
  classifySlot,
  onSetCondition,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Grade chips for `condition` — composed by the adapter, never the controller. */
  conditionSlot?: ReactNode;
  /** Per-line item camera for `item_photos`. */
  itemPhotoSlot?: ReactNode;
  /** Serial scan field + waiver for `serial`. */
  serialSlot?: ReactNode;
  /** Shared classify editor (`TriageClassifySection`) for unfound dock walk. */
  classifySlot?: ReactNode;
  /** Keyboard grade commit from {@link UnboxDockScanEntry}. */
  onSetCondition?: (grade: string) => void;
}) {
  const { activeKey, aspectByKey, settled } = useUnboxProcedureSteps(row);
  const { presence, transition } = useMotionRole(motionRole.swap.scan);

  // Before evidence settles, WHICH step is active is exactly what has not
  // resolved. Painting a confident control for the wrong step and swapping it a
  // beat later puts the wrong button under a hand that is already moving.
  const Control = settled && activeKey ? UNBOX_STEP_DOCK_CONTROLS[activeKey] : undefined;

  const ctx: UnboxStepDockContext = {
    row,
    receivingId: row.receiving_id ?? 0,
    staffId,
    aspect: activeKey ? (aspectByKey[activeKey] ?? null) : null,
    poRef: row.zoho_purchaseorder_number ?? null,
    poRouteRef: row.zoho_purchaseorder_id ?? row.zoho_purchaseorder_number ?? null,
    conditionSlot,
    itemPhotoSlot,
    serialSlot,
    classifySlot,
  };

  // Serial + classify own the band — skip the shared wedge there.
  const fillsBand = activeKey === 'serial' || activeKey === 'classify';
  const showScanEntry = settled && activeKey != null && !fillsBand;
  const growBand = settled && activeKey === 'classify';

  return (
    // The presence OUTLIVES its child: one that mounts with the child suppresses
    // the enter under `initial={false}`, and one that unmounts with it can never
    // play the exit. An empty presence renders no element and costs nothing.
    <div
      className={cn(
        'flex w-full min-w-0 gap-2',
        growBand ? 'min-h-11 flex-col items-stretch' : 'h-11 items-center',
      )}
    >
      {showScanEntry ? (
        <UnboxDockScanEntry row={row} onSetCondition={onSetCondition} />
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        {Control && activeKey ? (
          <motion.div
            key={activeKey}
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            // Fixed h-11 host for compact CTAs; classify grows (Band 1 expand).
            // The wedge fills Band 1 and the step control trails content-sized
            // (shrink-0). Serial / classify hide the wedge, so they fill alone.
            className={cn(
              'flex min-w-0 items-center',
              growBand ? 'min-h-11 w-full flex-1' : 'h-11',
              showScanEntry ? 'shrink-0' : 'flex-1',
            )}
            data-unbox-step-dock={activeKey}
          >
            <Control {...ctx} />
          </motion.div>
        ) : null}
        {/* Actionless steps (arrival_check) render the wedge alone — no empty
            flex-1 sibling, or the wedge would only claim half the band. */}
      </AnimatePresence>
    </div>
  );
}
