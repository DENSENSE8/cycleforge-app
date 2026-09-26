/** One row of the `unit-allocations` family — a single `order_unit_allocations` reservation, wire-safe. */

/** The shared allocation row — what the catalog, resolver and adapter read. */
export interface UnitAllocationTableRow {
  /** `order_unit_allocations.id` — the row key, never painted as a fact. */
  id: number;
  /** The order holding the unit. The IDENTITY fact. */
  order_id: number;
  allocated_at: string;
  /** `order_unit_allocations.state` enum, already `::text` on both feeds. */
  state: string;
  /**
   * The reserved unit. Absent on the unit-detail feed (the page IS the unit);
   * present on the per-SKU feed, where it is the only thing distinguishing two
   * allocations of the same SKU.
   */
  serial_unit_id?: number | null;
  /** Absent on feeds that filter released rows out. */
  released_at?: string | null;
  /** Absent on feeds that filter released rows out. */
  released_reason?: string | null;
  /** Staff name from the join. `null` ⇒ the system allocated it. */
  allocated_by_name?: string | null;
}
