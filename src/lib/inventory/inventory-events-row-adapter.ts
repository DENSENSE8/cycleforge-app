/** `PulseEventRow → CompoundRowView` — the inventory-events adapter. */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { PulseEventRow } from '@/components/inventory/types';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Lifecycle tone from the landing status. */
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
