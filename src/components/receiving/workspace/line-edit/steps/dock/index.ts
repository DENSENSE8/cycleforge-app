/**
 * The Unbox step DOCK-CONTROL registry — the action surface for the active step.
 *
 * ## The card reads; the dock acts (ruled 2026-08-02)
 *
 * A procedure step card carries **no action button**. Every control the operator
 * clicks to advance a step lives in the bottom dock, contextual to whichever
 * step is active. Law: `.claude/rules/display/station-workbench.md` →
 * *The dock's LEADING zone is the step's ACTION surface*.
 *
 * ## Why `Partial`, unlike `UNBOX_STEP_BODIES`
 *
 * Every declared step has a body — a card with nothing in it is a blank card at
 * a bench, so that registry is total and the guard requires it. Not every step
 * has an ACTION. `arrival_check` reads what the door already shot and
 * deliberately offers no camera. A registry that demanded an entry for that
 * would be answered with a placeholder button, which is worse than an honest
 * absence.
 *
 * `classify` *does* have a dock control: it mounts the shared
 * `TriageClassifySection` via `classifySlot` so an unfound carton can be
 * identified without leaving the dock (Band 1 grows for that step only).
 *
 * So the dock band renders **nothing** for a step with no entry, and
 * `procedure-step-dock.guard.test.ts` pins exactly which steps that is —
 * membership is a decision someone made, not a gap someone left.
 */

import { CartonPhotoDockControl } from './CartonPhotoDockControl';
import { ClassifyDockControl } from './ClassifyDockControl';
import { ContentsDockControl, LabelDockControl } from './AcknowledgeDockControl';
import {
  ConditionDockControl,
  ItemPhotoDockControl,
  SerialDockControl,
} from './SlotDockControls';
import type { UnboxStepDock } from './types';

export type { UnboxStepDockContext } from './types';

export const UNBOX_STEP_DOCK_CONTROLS: Partial<Record<string, UnboxStepDock>> = {
  classify: ClassifyDockControl,
  // The three bench carton shots differ in one value — which aspect they
  // capture — so they share one control, parameterised by the step's declared
  // aspect. Same call as the body sibling.
  shipping_label_photo: CartonPhotoDockControl,
  box_photo: CartonPhotoDockControl,
  packing_material: CartonPhotoDockControl,
  item_photos: ItemPhotoDockControl,
  condition: ConditionDockControl,
  serial: SerialDockControl,
  contents: ContentsDockControl,
  label: LabelDockControl,
};

/**
 * Steps that deliberately have NO dock action, with the reason.
 *
 * Exported so the guard reads the same list this module declares — a guard with
 * its own hand-typed copy is a second declaration, and the two drift the first
 * time a step changes shape.
 */
export const UNBOX_STEPS_WITHOUT_DOCK_ACTION: Readonly<Record<string, string>> = {
  arrival_check:
    'reads the door’s arrival_package evidence and must not offer a camera — a bench ' +
    'capture there would void the require_one receive gate',
};
