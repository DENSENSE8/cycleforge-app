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
 * has an ACTION — declare those in `UNBOX_STEPS_WITHOUT_DOCK_ACTION` with a
 * reason. Photo steps mount Link | Upload | Send to phone
 * (`PhotoStepDockStrip`). `classify` is a one-row Continue CTA — the editor
 * is Displays KNOW (`TriageClassifySection` / `railLeaf: 'classify'`).
 *
 * So the dock band renders **nothing** for a step with no entry, and
 * `procedure-step-dock.guard.test.ts` pins exactly which steps that is —
 * membership is a decision someone made, not a gap someone left.
 */

import { ArrivalPhotosDockControl } from './ArrivalPhotosDockControl';
import { CartonPhotoDockControl } from './CartonPhotoDockControl';
import { ClassifyDockControl } from './ClassifyDockControl';
import { ContentsDockControl, LabelDockControl } from './AcknowledgeDockControl';
import { ItemPhotoDockControl } from './ItemPhotoDockControl';
import {
  ConditionDockControl,
  SerialDockControl,
} from './SlotDockControls';
import type { UnboxStepDock } from './types';

export type { UnboxStepDockContext } from './types';

export const UNBOX_STEP_DOCK_CONTROLS: Partial<Record<string, UnboxStepDock>> = {
  // Door evidence — Link | Upload | Send to phone (arrival_package + aspect).
  arrival_label_photo: ArrivalPhotosDockControl,
  arrival_box_photo: ArrivalPhotosDockControl,
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
 * Dock controls for commit-phase keys (not `phase: 'capture'` vocabulary).
 * Empty: Print · Receive owns commit on the dogfood strip — no Band 1
 * "Scan location" CTA after print.
 */
export const UNBOX_COMMIT_DOCK_KEYS = [] as const;

/**
 * Steps that deliberately have NO dock action, with the reason.
 *
 * Exported so the guard reads the same list this module declares — a guard with
 * its own hand-typed copy is a second declaration, and the two drift the first
 * time a step changes shape.
 *
 * Empty today — every vocabulary step has a dock action (photo steps mount
 * Link | Upload | Send to phone). Keep the map so the either-or guard still
 * runs when a future actionless step is declared.
 */
export const UNBOX_STEPS_WITHOUT_DOCK_ACTION: Readonly<Record<string, string>> = {};
