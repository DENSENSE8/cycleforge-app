import type { ReactNode } from 'react';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * What a step body is handed — and, just as importantly, what it is NOT.
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
 * `contents` and `serial` compose surfaces with a dozen handlers each
 * (`PoLinesAccordion`, `SerialCard`). Threading those handlers through this bag
 * would make it the controller in all but name, so the adapter renders those
 * nodes and passes them in. A slot is a boundary, not a shortcut.
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
  /** The classify editor — the `classify` step's whole body. */
  classifySlot?: ReactNode;
  /** The serial field + waiver — the `serial` step's whole body. */
  serialSlot?: ReactNode;
  /** Per-aspect item capture — the `item_photos` step's whole body. */
  itemPhotoSlot?: ReactNode;
}

export type UnboxStepBody = (props: UnboxStepBodyContext) => ReactNode;
