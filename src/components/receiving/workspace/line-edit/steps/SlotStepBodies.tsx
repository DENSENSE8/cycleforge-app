'use client';

/**
 * The four step bodies whose surface is composed by the adapter and handed in as
 * a slot.
 *
 * `classify`, `contents`, `condition`/`serial` and `item_photos` each mount an
 * existing surface that carries a dozen handlers (`TriageClassifySection`,
 * `PoLinesAccordion`, `SerialCard`, the item camera). Threading those handlers
 * through {@link UnboxStepBodyContext} would turn the bag into the controller
 * under a different name, which is the coupling this whole phase exists to
 * remove. So the adapter — the one module that legitimately knows both the
 * domain and the primitive — renders the node, and the body places it.
 *
 * They are thin on purpose. What each one buys is a registry entry the
 * divergence guard can require, and a place for the step's own chrome that is
 * not inside the composed surface.
 *
 * ## Honest absence, not a dead affordance
 *
 * A body whose slot is missing renders a line saying so rather than an empty
 * frame. On a lane that genuinely has nothing to show (a carton with no item
 * evidence to capture), a labelled-but-empty region reads as broken; a sentence
 * reads as a fact.
 */

import type { UnboxStepBodyContext } from './types';

function MissingSlot({ what }: { what: string }) {
  return <p className="text-role-caption text-text-soft">{what}</p>;
}

export function ClassifyStepBody({ classifySlot }: UnboxStepBodyContext) {
  return <>{classifySlot ?? <MissingSlot what="Nothing to classify on this carton." />}</>;
}

export function ContentsStepBody({ contentsSlot }: UnboxStepBodyContext) {
  return <>{contentsSlot ?? <MissingSlot what="No lines on this carton yet." />}</>;
}

export function SerialStepBody({ serialSlot }: UnboxStepBodyContext) {
  return <>{serialSlot ?? <MissingSlot what="No serial capture on this line." />}</>;
}

export function ItemPhotoStepBody({ itemPhotoSlot }: UnboxStepBodyContext) {
  // `data-unbox-item-photos` moved here verbatim from `ActiveLineConditionSerial`
  // — a Playwright spec pins it as the desktop item-evidence anchor, and the
  // attribute is the contract, not the component that used to carry it.
  if (!itemPhotoSlot) return <MissingSlot what="No item evidence to capture on this line." />;
  return (
    <div className="flex min-w-0 items-center justify-between gap-2" data-unbox-item-photos>
      <p className="truncate text-role-caption text-text-soft">Photograph the item</p>
      <div className="-my-0.5 shrink-0">{itemPhotoSlot}</div>
    </div>
  );
}
