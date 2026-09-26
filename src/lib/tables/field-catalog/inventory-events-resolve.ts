/** Inventory-events slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { PulseEventRow } from '@/components/inventory/types';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** `prev → next`, or whichever end the event has. */
function transitionText(prev: string | null, next: string | null): string | null {
  const a = str(prev);
  const b = str(next);
  if (a && b) return `${a} → ${b}`;
  return b ?? a;
}

/** Legacy rows stored extra serials as "Supplemental serial <SN> (beyond expected qty)". */
function notesText(notes: string | null): string | null {
  const raw = str(notes);
  if (!raw) return null;
  const match = raw.match(/^Supplemental serial (\S+) \(beyond expected qty\)$/i);
  return match ? `Serial ${match[1]}` : raw;
}

/** The SKU, with the resolved catalog title when the enrichment found one. */
function skuText(row: PulseEventRow): string | null {
  const sku = str(row.sku);
  const title = str(row.product_title);
  if (sku && title) return `${sku} · ${title}`;
  return sku ?? title;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveInventoryEventsSlotValue(
  row: PulseEventRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'inventory-events.occurred':
      return { kind: 'value', text: str(row.occurred_at) };
    case 'inventory-events.event_type':
      return { kind: 'value', text: str(row.event_type) };
    case 'inventory-events.status_change':
      return { kind: 'value', text: transitionText(row.prev_status, row.next_status) };
    case 'inventory-events.sku':
      return { kind: 'value', text: skuText(row) };
    case 'inventory-events.serial':
      return { kind: 'value', text: str(row.serial_number) };
    case 'inventory-events.bin':
      return { kind: 'value', text: transitionText(row.prev_bin_name, row.bin_name) };
    case 'inventory-events.actor':
      return { kind: 'value', text: str(row.actor_name) };
    case 'inventory-events.station':
      return { kind: 'value', text: str(row.station) };
    case 'inventory-events.notes':
      return { kind: 'value', text: notesText(row.notes) };
    default:
      return null;
  }
}
