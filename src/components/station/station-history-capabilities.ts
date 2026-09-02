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
 * **No `GridSurfaceDescriptor` yet, deliberately.** Rows paint
 * {@link ORDERS_COMPOUND_COLUMNS} through {@link OrdersQueueTableRow}'s
 * compound path. A descriptor here would invent a second column declaration
 * that nothing renders from. The benches still sit outside PRODUCT_TABLES
 * (LedgerGrid host, not DataTable) — that host is not a second cell registry.
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
