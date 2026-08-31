/**
 * Station history (Tech / Packer benches) — declared grid surface capabilities.
 *
 * `StationHistoryTable` renders through the SAME `OrdersQueueTableRow` the
 * outbound Queue grid uses, inside the same `LedgerGrid`. That reuse is the
 * point (windowing, select gutter, keyboard focus for free) — but it also meant
 * the bench inherited Orders' feature set **by import rather than by
 * declaration**: `OrdersQueueTableRow` reached for `ORDERS_GRID_CAPABILITIES`
 * directly, so a tech log row resolved its fill against the outbound triage
 * vocabulary. A surface with no bag of its own is not "all false" — it is
 * unclassified, and unclassified is what lets a capability leak in through a
 * shared component.
 *
 * So the benches declare their own. The load-bearing difference from
 * {@link ORDERS_GRID_CAPABILITIES} is `rowTriageFlags: false`: staff triage wash
 * is outbound dispatch vocabulary (`order-row-flags`), and a Tech/Packer history
 * row is a log of work already done — there is nothing to triage on it.
 *
 * **No `GridSurfaceDescriptor` yet, deliberately.** The benches mount the
 * bench-owned flat model (`STATION_HISTORY_COLUMNS` — the old Orders hand
 * array, rehomed here by the slot plan's Wave 1 kill) with no per-staff
 * visibility layer. A descriptor here would have to invent a second column
 * declaration that nothing renders from, which is the stale-twin failure
 * `makeGridSurfaceDescriptor`'s own docblock warns about. The whole stack is
 * the kill list's separate station-history item: it takes the binding waist +
 * a catalog, or it stops pretending to be a spreadsheet.
 */

import type { GridSurfaceCapabilities } from '@/design-system/components/grid';

/** Tech / Packer history benches — day-banded log; never outbound triage wash. */
export const STATION_HISTORY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: true,
};
