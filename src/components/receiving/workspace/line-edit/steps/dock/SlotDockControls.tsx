'use client';

/**
 * The dock controls whose control is composed by the adapter and handed in as a
 * slot — `item_photos`, `condition`, and `serial`.
 *
 * Each mounts an existing surface with handlers the step has no business knowing
 * (the item camera's scope resolution; the grade patch on
 * `useUnboxLineController`; the serial scan waist). Threading those through
 * {@link UnboxStepDockContext} would turn the bag into the controller under a
 * different name — the coupling the accordion split exists to remove — so the
 * adapter renders the node and the control places it. Same discipline as
 * `SlotStepBodies`, one altitude over.
 *
 * Flush floor: every slot fills Band 1 height · width (`gap-0`, `items-stretch`).
 * Never a content-sized camera chip floating in air.
 */

import type { UnboxStepDockContext } from './types';

function MissingSlot({ what }: { what: string }) {
  return <p className="truncate text-role-caption text-text-soft">{what}</p>;
}

/** Item photos Band 1 lives in {@link ItemPhotoDockControl} (three-button strip). */

export function ConditionDockControl({ conditionSlot }: UnboxStepDockContext) {
  if (!conditionSlot) return <MissingSlot what="No grade to set on this line." />;
  return (
    <div
      className="flex h-11 w-full min-w-0 items-stretch gap-0"
      data-unbox-condition-dock
    >
      {/* barDistribute ConditionPills fill the segment — no left-clump dead air. */}
      <div className="flex h-full min-w-0 w-full flex-1 items-stretch overflow-x-auto">
        {conditionSlot}
      </div>
    </div>
  );
}

export function SerialDockControl({ serialSlot }: UnboxStepDockContext) {
  if (!serialSlot) return <MissingSlot what="No serial capture on this line." />;
  // The scan field lives here — not in the step body —
  // so the operator's hand stays on the band that never scrolls away. Saved
  // chips already read from the items panel; the card has nothing left to show.
  // Horizontal scroll + overflow-y clip keep multi-qty / match stacks inside
  // the fixed h-11 dock entry row.
  return (
    // data-unbox-dock-scan: generalized wedge owner (sidebar skip). Keep
    // data-unbox-serial-dock for serial-specific probes / autofocus guards.
    // Serial dominance: field owns ≥80% of the flush floor band (FileText /
    // terminal yield while activeKey === 'serial').
    <div
      className="flex h-11 w-full min-w-[80%] flex-1 items-stretch gap-0 overflow-x-auto overflow-y-hidden"
      data-unbox-serial-dock
      data-unbox-dock-scan
    >
      <div className="flex h-full min-w-0 w-full flex-1 items-stretch">
        {serialSlot}
      </div>
    </div>
  );
}
