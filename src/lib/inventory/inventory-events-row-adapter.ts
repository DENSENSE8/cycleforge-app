/**
 * `PulseEventRow → CompoundRowView` — the inventory-events adapter.
 *
 * The family's ONLY contribution to how a ledger row paints. Pure, strings and
 * enums, no JSX: "the moment a family can pass a node, the fork walks back in
 * wearing a view model." Every fact it does not name here is a bound SLOT, and
 * those come from `inventory-events-resolve.ts` through the engine.
 *
 * It replaced `events-grid/cells/index.tsx`, a per-family cell map that
 * invariant 1 of `table-engine-law.ts` forbids outright. The faces that map
 * carried (a relative age, a mono event tag, a copyable code) were never about
 * inventory events, so they moved into the engine as display-type faces
 * (`compound-slot-face.ts`) where every family inherits them.
 *
 * ## What the compound row says about an event
 *
 * - TITLE — the product, because that is what an operator recognizes; the SKU
 *   is the identity fact and stays a bound track.
 * - the note line — what somebody wrote about this specific event.
 * - IDS — the SKU. On the compound morph the identity slot IS the shared
 *   `fulfillment` track (`materialize-tracks.ts`), and this family's identity
 *   fact is `inventory-events.sku`, so that is what the cell must resolve. The
 *   serial is a bound status track and paints itself.
 * - STATE — where the unit ended up (`next_status`), with the move it made on
 *   the hover. An event with no status change is not a state change, so it
 *   paints the event type instead of inventing one.
 *
 * There is no money and no deadline on an inventory event; both stay null, and
 * the shared cells paint the honest empty face rather than a zero.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { PulseEventRow } from '@/components/inventory/types';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Lifecycle tone from the landing status.
 *
 * Deliberately coarse and deliberately NOT a colour lookup: the view model is
 * enums, and which hue an `alert` wears is the cell's decision. A hold or a
 * mismatch is the only thing here that wants a human.
 */
function toneFor(status: string | null): CompoundStateTone {
  const s = (status ?? '').toLowerCase();
  if (!s) return 'neutral';
  if (s.includes('hold') || s.includes('damage') || s.includes('mismatch') || s.includes('quarantine')) {
    return 'alert';
  }
  if (s.includes('shipped') || s.includes('sold') || s.includes('received') || s.includes('closed')) {
    return 'done';
  }
  return 'neutral';
}

export function inventoryEventCompoundView(row: PulseEventRow): CompoundRowView {
  const prev = str(row.prev_status);
  const next = str(row.next_status);
  const state = next ?? prev;
  return {
    id: String(row.id),
    // An event has no photo of its own; the shared cell paints the typed
    // placeholder rather than a broken image.
    thumbUrl: null,
    title: str(row.product_title) ?? str(row.sku) ?? 'Unknown item',
    note: str(row.notes),
    // The IDENTITY fact — `inventory-events.sku`. The compound identity slot
    // is the fulfillment track, so this is the cell that resolves it. An event
    // has no carrier, so tracking stays null rather than borrowing a fact.
    orderId: str(row.sku),
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: state ?? row.event_type,
    stateTone: toneFor(state),
    // The move, on the hover — the pill has room for where it ENDED, and where
    // it came from is the detail behind that.
    stateTip: prev && next ? `${prev} → ${next}` : undefined,
    nextStep: str(row.station) ? { label: row.station as string } : null,
    // An event is a fact that already happened: there is no deadline it can
    // miss and no money on it.
    delay: null,
    amount: null,
  };
}
