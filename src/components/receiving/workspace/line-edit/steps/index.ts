/**
 * The Unbox step-body registry — one component per declared capture step.
 *
 * ## Why a registry and not a switch in the adapter
 *
 * The step vocabulary is DATA (`@/lib/stations/procedure`), resolved per carton
 * variant: unfound cartons gain `classify`, local pickup drops the dunnage
 * shots, returns reorder serial before condition. A `switch` inside the render
 * path invites hardcoding the common list, which is exactly what breaks those
 * variants — and it breaks them silently, as a blank card at a bench.
 *
 * A record makes the coverage question answerable statically, which is what
 * `procedure-step-body.guard.test.ts` asks: every step
 * `resolveProcedureSteps(unbox, …, 'capture')` can yield has a key here. A
 * declared step with no body fails CI rather than rendering an empty step at the
 * bench.
 *
 * ## `CartonPhotoStepBody` serves three keys, deliberately
 *
 * The three bench carton shots differ only in which aspect they capture. Three
 * near-identical files would be a fork by copy-paste.
 *
 * ## A body renders CONTENT, never an action (ruled 2026-08-02)
 *
 * Every control that advances a step lives in the bottom dock — `./dock/index.ts`
 * → `UNBOX_STEP_DOCK_CONTROLS`, rendered by `../UnboxStepDock`. These bodies are
 * the step's evidence: the photos taken, the label face, the line list, the
 * grade on record. Law:
 * *The dock's LEADING zone is the step's ACTION surface*.
 */

import { CartonPhotoStepBody } from './CartonPhotoStepBody';
import { ArrivalCheckStepBody } from './ArrivalCheckStepBody';
import { ConditionStepBody } from './ConditionStepBody';
import { LabelStepBody } from './LabelStepBody';
import { ClassifyStepBody, ContentsStepBody, SerialStepBody } from './SlotStepBodies';
import { ItemPhotoStepBody } from './ItemPhotoStepBody';
import type { UnboxStepBody } from './types';

// Only the registry and its types are public. The bodies themselves are reached
// THROUGH the record — a named re-export would be a second way in, and the
// second way in is how a step gets mounted somewhere the guard cannot see it.
export type { UnboxStepBodyContext } from './types';

export const UNBOX_STEP_BODIES: Record<string, UnboxStepBody> = {
  classify: ClassifyStepBody,
  arrival_label_photo: ArrivalCheckStepBody,
  arrival_box_photo: ArrivalCheckStepBody,
  shipping_label_photo: CartonPhotoStepBody,
  box_photo: CartonPhotoStepBody,
  packing_material: CartonPhotoStepBody,
  contents: ContentsStepBody,
  condition: ConditionStepBody,
  item_photos: ItemPhotoStepBody,
  serial: SerialStepBody,
  label: LabelStepBody,
};
