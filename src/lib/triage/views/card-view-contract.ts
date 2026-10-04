/**
 * The card-view contract — ONE rule, two consumers: a card paints a slot iff
 * its view (`TriageViewDecl.status` / `slots`) declares it.
 *
 *   1. `triage-views.test.ts` — runs every registered adapter's real model
 *      builder over sample records (`card-view-adapters.ts`) through it.
 *   2. `scripts/card-views-guard.ts --json` — the same check, printed per
 *      view; the `ds_card_views` MCP gate spawns it.
 *
 * The compiler holds `RecordCard` to the same declaration
 * (`ViewCardModel` / `ViewQuickLookProps` in `triage-view.ts`); this module is
 * the runtime half, which also covers the cards that are not `RecordCard`.
 */

import type { RecordCardModel, RecordCardStatus } from '@/design-system/components/record-card/record-card-types';
import type { CardViewDecl } from '@/design-system/components/triage-card-list/triage-view';

/** What one card actually paints. */
export interface PaintedCardFace {
  /** The top-right status painter (`none` = no status). */
  status: RecordCardStatus['kind'];
  /** A channel on line 1. */
  channel: boolean;
  /** A person on line 1. */
  person: boolean;
  /** Space folds a quick look. */
  quickLook: boolean;
  /** A line carries a photo. */
  photo: boolean;
}

/** A `RecordCard` model's face; `quickLook` = the adapter passes a peek. */
export function recordCardFace(model: Pick<RecordCardModel, 'status' | 'channel' | 'person' | 'lines'>, quickLook: boolean): PaintedCardFace {
  return {
    status: model.status.kind,
    channel: model.channel != null,
    person: model.person != null,
    quickLook,
    photo: model.lines.some((line) => line.photoUrl != null),
  };
}

/** Every way `face` disagrees with what `view` declares; empty = they agree. */
export function cardViewMismatches(view: CardViewDecl, face: PaintedCardFace): string[] {
  const mismatches: string[] = [];
  if (face.status !== view.status) mismatches.push(`status: the view declares '${view.status}', the card paints '${face.status}'`);
  if (face.channel !== (view.slots.channel !== 'none')) {
    mismatches.push(`channel: the view declares '${view.slots.channel}', the card ${face.channel ? 'paints one' : 'paints none'}`);
  }
  if (face.person !== (view.slots.person !== 'none')) {
    mismatches.push(`person: the view declares '${view.slots.person}', the card ${face.person ? 'paints one' : 'paints none'}`);
  }
  if (face.quickLook !== (view.slots.quickLook === 'peek')) {
    mismatches.push(`quick look: the view declares '${view.slots.quickLook}', the card ${face.quickLook ? 'folds one' : 'folds none'}`);
  }
  // One way only: a `line` view may still have a record with no photo; a `none` view must never be handed one (the card would drop it).
  if (face.photo && view.slots.photo === 'none') mismatches.push(`photo: the view declares 'none', the card is handed a line photo`);
  return mismatches;
}
