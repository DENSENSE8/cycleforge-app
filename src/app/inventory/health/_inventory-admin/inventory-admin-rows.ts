/**
 * Row mappers for the inventory diagnostics dashboard — this page's SQL shapes
 * lifted onto the shape a REGISTERED family already speaks.
 *
 * `RecentEventsSection` mounts `inventory-events`, the family the Ledger and
 * the per-SKU pulse already mount, so it gets no catalog of its own (invariant
 * 2: one entity, one registration, many mounts). What the page does need is a
 * translation, because its loader is narrower than the Ledger feed and `pg`
 * hands back `Date` objects where the resolver reads ISO strings — the same job
 * `sku-detail-rows.ts` does for `/inventory/health/sku/[sku]`.
 *
 * ## The retired `Unit / SKU` cell packed TWO links into one track
 *
 * `RECENT_EVENT_COLUMNS` had a single `unit_sku` column whose cell rendered
 * `#123 · ABC-1` — two independent identifiers, two independent hrefs, one
 * header word, no way to sort or search either one. They are two facts and the
 * family already names both: `inventory-events.sku` is the IDENTITY (it also
 * carries `paths.title`, the product name this page does not join) and
 * `inventory-events.serial` is a bound track of its own. So the mapper splits
 * them and the engine paints each in its own cell.
 *
 * Facts this page does not fetch (bin moves, notes, receiving refs, the
 * enriched product title) resolve to `null` and their tracks dash — the retired
 * cells never painted them and the mapper does not invent them.
 *
 * Pure: no React, no clock, no I/O.
 */

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
