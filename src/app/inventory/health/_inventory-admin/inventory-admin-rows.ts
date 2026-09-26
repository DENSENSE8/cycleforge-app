/** Row mappers for the inventory diagnostics dashboard — this page's SQL shapes lifted onto the shape a REGISTERED family already speaks. */

import type { PulseEventRow } from '@/components/inventory/types';
import type { RecentEventRow } from './inventory-admin-data';

export function recentInventoryEventRows(
  rows: readonly RecentEventRow[],
): PulseEventRow[] {
  return rows.map((e) => ({
    id: e.id,
    // `PulseEventRow.occurred_at` is a required string; the column is NOT NULL
    // so the empty string never appears in practice, and the date resolver
    // dashes it if it ever did.
    occurred_at: e.occurred_at instanceof Date ? e.occurred_at.toISOString() : String(e.occurred_at ?? ''),
    event_type: e.event_type,
    actor_staff_id: e.actor_staff_id,
    actor_name: e.actor_name,
    station: e.station,
    sku: e.sku,
    // No sku_catalog join on this dashboard's query: the item cell's title
    // falls back to the SKU rather than borrowing a name from nowhere.
    product_title: null,
    serial_unit_id: e.serial_unit_id,
    // The page's query joins no serial number — the retired cell painted the
    // unit REFERENCE (`#123`), so that is what the serial track says.
    serial_number: e.serial_unit_id == null ? null : `#${e.serial_unit_id}`,
    bin_id: null,
    bin_name: null,
    prev_bin_id: null,
    prev_bin_name: null,
    prev_status: e.prev_status,
    next_status: e.next_status,
    notes: null,
    payload: {},
    receiving_id: null,
    receiving_line_id: null,
  }));
}
