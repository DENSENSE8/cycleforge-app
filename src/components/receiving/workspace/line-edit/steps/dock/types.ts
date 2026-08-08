import type { ReactNode } from 'react';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * What a step's DOCK CONTROL is handed.
 *
 * ## The card reads; the dock acts (ruled 2026-08-02)
 *
 * A procedure step card carries **no action button**. Everything the operator
 * clicks to advance the step — a camera, a confirm, a grade picker — lives in
 * the bottom dock, contextual to the active step. The card is where the step's
 * evidence is READ.
 *
 * Why: the operator's hand is at the dock. The composer, the pager and the
 * Print · Receive terminal are already there, so a control that lives in a card
 * asks them to leave the one band they never leave — and it moves with the card,
 * because the deck scrolls and the dock does not. A control whose position
 * depends on scroll offset is a control you have to look for.
 *
 * ## Same bag discipline as {@link UnboxStepBodyContext}
 *
 * Never the controller. `useUnboxLineController` is the station's god object;
 * passing it here would re-create one level down exactly the coupling the
 * accordion split dismantled. Narrow fields, or a slot rendered by the adapter —
 * which is the one module that legitimately knows both the domain and the
 * primitive.
 */
export interface UnboxStepDockContext {
  row: ReceivingLineRow;
  receivingId: number;
  staffId: string;
  /**
   * The single frame this step asks for, when it is a photo step. Resolved from
   * the step declaration by the deck — never guessed, never defaulted: an aspect
   * is a claim about what the operator pointed the camera at.
   */
  aspect?: PhotoAspect | null;
  /** Zoho PO id/number — routes a phone capture request. Null → phone leg off. */
  poRouteRef?: string | null;
  /** Carton PO/order ref, stamped onto uploads for the viewer's details panel. */
  poRef?: string | null;
  /** The grade picker for `condition` — chips, rendered by the adapter. */
  conditionSlot?: ReactNode;
  /** The per-line item camera for `item_photos`. */
  itemPhotoSlot?: ReactNode;
  /** The serial scan field + waiver — the `serial` step's action. */
  serialSlot?: ReactNode;
  /**
   * Classify editor (`TriageClassifySection`) — adapter-composed so the dock
   * bag never takes the line controller. Band grows while this step is active.
   */
  classifySlot?: ReactNode;
}

export type UnboxStepDock = (props: UnboxStepDockContext) => ReactNode;
