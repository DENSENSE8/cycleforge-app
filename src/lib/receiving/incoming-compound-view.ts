/**
 * Incoming row → the compound STATE face. Pure; no React, no hooks.
 *
 * Incoming rows are `ReceivingLineRow`, the same type Unbox and History carry,
 * so Incoming does NOT get its own `row -> CompoundRowView` adapter — it reuses
 * {@link receivingCompoundView} and overrides the one thing that genuinely
 * differs: which lifecycle the state pill is reporting.
 *
 * That difference is real, not cosmetic. Unbox / History / Testing report
 * `workflow_status` — what the WAREHOUSE has done to the line. Incoming reports
 * `delivery_state` — what the CARRIER has done to the box, before the warehouse
 * has touched it at all. A row that reads `RECEIVED` on one table and
 * `Delivered · not scanned` on another is not a layout difference; it is two
 * different questions with two different answers, which is exactly the kind of
 * difference the shared compound row is supposed to let through.
 *
 * The vocabulary is NOT declared here. Label, tip and urgency all resolve from
 * `INCOMING_DELIVERY_STATE_FACE` — the same SoT the hunt tiles and the flat
 * grid glyph read — so a new delivery state joins this table by being added
 * there, once.
 */

import type { CompoundStateTone } from '@/components/tables/compound/compound-row-model';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { incomingDeliveryStateFace } from './incoming-delivery-state-face';
import {
  INCOMING_REMOVAL_REASON_FACE,
  resolveIncomingRemovalReasonForRow,
} from './incoming-removal-reason';

/**
 * Tile tone → the compound row's three-tone vocabulary.
 *
 * Derived from the face SoT's own `tileTone` rather than from a second list of
 * state names: the sidebar tile and the grid pill must agree about which lanes
 * are shouting, and they can only do that by reading one urgency answer.
 *
 * `blue` / `gray` / `amber` are lanes where the box is simply in motion or not
 * yet trackable — ordinary progress. Everything hotter is a row a human has to
 * act on, and the compound row has exactly one loud tone for that.
 */
const TILE_TONE_TO_COMPOUND: Record<string, CompoundStateTone> = {
  blue: 'neutral',
  gray: 'neutral',
  amber: 'neutral',
  rose: 'alert',
  red: 'alert',
  orange: 'alert',
  violet: 'alert',
};

export interface IncomingStateFace {
  label: string;
  tone: CompoundStateTone;
  tip?: string;
}

/**
 * The state pill for one Incoming row.
 *
 * **A removed row answers a different question.** On the recently-removed lane
 * the operator came to find out WHY the row left, so the reason takes the pill
 * — which is how that lane keeps the identical column model instead of
 * appending a seventh track nobody else can use. Its tone is always neutral: a
 * row that has already left the lane is history, and history does not need a
 * human.
 */
export function incomingStateFace(row: ReceivingLineRow): IncomingStateFace {
  const removal = resolveIncomingRemovalReasonForRow(row);
  if (removal) {
    const face = INCOMING_REMOVAL_REASON_FACE[removal];
    return { label: face.label, tone: 'neutral', tip: face.tip };
  }

  const delivery = incomingDeliveryStateFace(row.delivery_state);
  if (!delivery) {
    // No carrier signal at all. "Expected" is the honest word for a PO line
    // that has been issued and nothing has happened to yet; a blank pill would
    // read as a missing value rather than as a stage.
    return { label: 'Expected', tone: 'neutral' };
  }

  return {
    label: delivery.tileLabel,
    tone: TILE_TONE_TO_COMPOUND[delivery.tileTone] ?? 'neutral',
    // The label clips inside the 10rem track; the tip carries the full phrase.
    tip: delivery.tip,
  };
}
