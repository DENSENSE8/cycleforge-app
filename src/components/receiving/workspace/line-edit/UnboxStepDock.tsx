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
 * ## Always-left procedure waist
 *
 * Band 1 leads with a **compact** {@link UnboxDockScanEntry} (`w-8`
 * collapse-strip twin — Plus idle, glow + caret, no placeholder) on every
 * shared-entry step — **including photo** (`UNBOX_PHOTO_STRIP_KEYS`). Step
 * ACTION (ack · grades · photo Link|Upload|Send) fills the remaining width.
 * Serial and classify own Band 1 alone (serial field *is* the waist).
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

  // Serial · classify own the band alone — shared waist would dual-mount.
  // Photo steps keep the left waist; strip mounts as the right flex-1 sibling.
  const ownsBandAlone = activeKey === 'serial' || activeKey === 'classify';
  const showScanEntry = settled && activeKey != null && !ownsBandAlone;
  const growBand = settled && activeKey === 'classify';

  return (
    // The presence OUTLIVES its child: one that mounts with the child suppresses
    // the enter under `initial={false}`, and one that unmounts with it can never
    // play the exit. An empty presence renders no element and costs nothing.
    <div
      className={cn(
        'flex w-full min-w-0 gap-0',
        growBand ? 'min-h-11 flex-col items-stretch' : 'h-11 items-stretch',
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
            // Full-height flush segment. With the wedge, both flex-1 so CTAs
            // claim remaining Band 1 width (never a content-sized chip in air).
            // Serial / classify hide the wedge and fill alone. Host gap-0 —
            // step control owns a leading hairline when it trails the wedge.
            className={cn(
              'flex min-w-0 items-stretch',
              growBand ? 'min-h-11 w-full flex-1' : 'h-11 flex-1',
              showScanEntry && 'border-l border-border-hairline',
            )}
            data-unbox-step-dock={activeKey}
          >
            <Control {...ctx} />
          </motion.div>
        ) : null}
        {/* Actionless steps render the wedge alone — no empty flex-1 sibling,
            or the wedge would only claim half the band. */}
      </AnimatePresence>
    </div>
  );
}
