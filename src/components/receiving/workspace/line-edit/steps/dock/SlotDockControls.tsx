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
 * A slot that is missing renders a sentence, never an empty frame: on a lane
 * that genuinely has nothing to do, a labelled-but-empty band reads as broken.
 */

import type { UnboxStepDockContext } from './types';

function MissingSlot({ what }: { what: string }) {
  return <p className="truncate text-role-caption text-text-soft">{what}</p>;
}

export function ItemPhotoDockControl({ itemPhotoSlot }: UnboxStepDockContext) {
  // Anchor for the procedure-dock item camera (parked `unbox-work` lane). Main
  // Unbox PO-line body no longer mounts this — condition · serial only.
  if (!itemPhotoSlot) return <MissingSlot what="No item evidence to capture on this line." />;
  return (
    // Prompt dropped with the move into the composer footer — the cue line above
    // the dock names the step. See CartonPhotoDockControl for the full reason.
    <div className="flex h-11 min-w-0 items-center gap-2" data-unbox-item-photos>
      <div className="-my-0.5 shrink-0">{itemPhotoSlot}</div>
    </div>
  );
}

export function ConditionDockControl({ conditionSlot }: UnboxStepDockContext) {
  if (!conditionSlot) return <MissingSlot what="No grade to set on this line." />;
  return (
    <div className="flex h-11 min-w-0 items-center gap-2" data-unbox-condition-dock>
      {/* The pills scroll rather than wrap: the dock is a fixed band, and a
          wrapping row would grow it out from under the clearance the deck
          reserves below itself. */}
      <div className="min-w-0 flex-1 overflow-x-auto">{conditionSlot}</div>
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
    <div className="flex h-11 min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden" data-unbox-serial-dock>
      <div className="min-w-0 flex-1">{serialSlot}</div>
    </div>
  );
}
