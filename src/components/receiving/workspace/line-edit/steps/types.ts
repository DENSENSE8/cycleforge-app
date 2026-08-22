import type { ReactNode } from 'react';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * What a step body is handed — and, just as importantly, what it is NOT.
 *
 * ## Never an ACTION (ruled 2026-08-02)
 *
 * A step body renders the step's CONTENT — the evidence, the face, the line
 * list, the grade it currently carries. It never renders the button that
 * advances the step. Those live in the bottom dock, contextual to the active
 * step: `./dock/index.ts` → `UNBOX_STEP_DOCK_CONTROLS`, rendered by
 * `../UnboxStepDock`. Law:
 * *The dock's LEADING zone is the step's ACTION surface*.
 *
 * Which is why this bag has no action handlers on it and must not grow any: a
 * slot named `onConfirm` here is the ruling being walked back one prop at a
 * time.
 *
 * ## Never the controller
 *
 * `useUnboxLineController` is the station's god object; passing it into every
 * body would re-create, one level down, exactly the coupling the accordion split
 * exists to dismantle. Each body reads one narrow slice of this bag, so what a
 * step actually depends on is legible from its destructuring rather than from
 * whatever it happens to reach for at runtime.
 *
 * ## Slots are how the composite steps stay presentational
 *
 * `contents` composes `PoLinesAccordion` via a slot. `classify` has no body
 * slot — KNOW is Displays (`TriageClassifySection`); DO is the dock Continue.
 * `serial` has no body slot — its scan field is the dock's `serialSlot`.
 */
export interface UnboxStepBodyContext {
  row: ReceivingLineRow;
  receivingId: number;
  staffId: string;
  /**
   * The single frame this step asks for, when it is a photo step. Resolved from
   * the step declaration by the adapter — never guessed by the body, and never
   * defaulted: an aspect is a claim about what the operator pointed the camera
   * at.
   */
  aspect?: PhotoAspect | null;
  /** Zoho PO id/number — routes a phone capture request. Null → phone leg off. */
  poRouteRef?: string | null;
  /** Carton PO/order ref, stamped onto uploads for the viewer's details panel. */
  poRef?: string | null;
  /** The carton's line list — the `contents` step's whole body. */
  contentsSlot?: ReactNode;
  /**
   * The line's item photos, read-only — the `item_photos` step's whole body.
   * The CAMERA is not here; it is the dock's `ItemPhotoDockControl`.
   */
  itemPhotoGallerySlot?: ReactNode;
  /**
   * The printed label preview + its editors — the `label` step's whole body.
   * The ONE label surface: there is no standalone preview beneath the column.
   */
  labelSlot?: ReactNode;
}

export type UnboxStepBody = (props: UnboxStepBodyContext) => ReactNode;
