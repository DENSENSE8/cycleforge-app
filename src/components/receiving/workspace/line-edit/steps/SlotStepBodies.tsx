'use client';

/**
 * The three step bodies whose surface is composed by the adapter and handed in
 * as a slot.
 *
 * `classify` mounts an existing surface that carries a dozen handlers
 * (`TriageClassifySection`). `contents` and `serial` are intentionally empty
 * in Unbox — the line list lives in {@link UnboxItemsPanel}, and the serial
 * scan field lives in the dock ({@link SerialDockControl}). Threading handlers
 * through {@link UnboxStepBodyContext} would turn the bag into the controller
 * under a different name, which is the coupling this whole phase exists to
 * remove. So the adapter — the one module that legitimately knows both the
 * domain and the primitive — renders the node, and the body places it (or stays
 * empty when the action moved to the dock).
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

/**
 * Unbox pins the line list in {@link UnboxItemsPanel} (workbench top). The
 * centre must not re-draw the same accordion — that was the duplicate the
 * operator cut. A missing slot is therefore intentional absence, not "no
 * lines yet"; the dock acknowledge is the step's action.
 */
export function ContentsStepBody({ contentsSlot }: UnboxStepBodyContext) {
  if (!contentsSlot) return null;
  return <>{contentsSlot}</>;
}

/**
 * The scan field moved to the dock ({@link SerialDockControl}). Saved chips
 * already read from the items panel. The step body stays empty on this step —
 * intentional absence, not "no serial yet".
 */
export function SerialStepBody(_ctx: UnboxStepBodyContext) {
  return null;
}

