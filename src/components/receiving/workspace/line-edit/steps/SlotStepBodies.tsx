'use client';

/**
 * Slot / empty step bodies for the (parked) centre ProcedureDeck registry.
 *
 * `classify` · `serial` · `contents` are intentionally empty in Unbox centre —
 * classify KNOW is Displays (`TriageClassifySection` / `railLeaf`), serial DO
 * is the dock, contents list is {@link UnboxItemsPanel}. Registry entries stay
 * so the divergence guard can require a body per vocabulary key.
 */

import type { UnboxStepBodyContext } from './types';

/**
 * Editor is Displays KNOW — centre body stays empty (ProcedureDeck parked).
 */
export function ClassifyStepBody(_ctx: UnboxStepBodyContext) {
  return null;
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

