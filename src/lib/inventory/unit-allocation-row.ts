/**
 * One row of the `unit-allocations` family — a single `order_unit_allocations`
 * reservation, wire-safe.
 *
 * ## Why this type is wider than either desk's own row
 *
 * Two surfaces paint this entity from opposite ends, and they always will:
 *
 * | surface                          | reads it as            | carries        |
 * |----------------------------------|------------------------|----------------|
 * | `/inventory?unit=` (ByUnitView)  | "who reserved my unit" | release facts  |
 * | `/inventory/health/sku/[sku]`     | "what is holding my    | `serial_unit_id`|
 * |                                  |  stock right now"      |                 |
 *
 * The unit detail already knows WHICH unit it is showing, so its feed omits
 * `serial_unit_id`; the SKU page filters `state <> 'RELEASED'`, so its feed
 * omits the release columns. Neither omission is a different ENTITY — it is
 * the same row read through a narrower `SELECT`, which is exactly the case the
 * `incoming` / `receiving` precedent answers with one vocabulary and (if the
 * operator wants different defaults) two layout documents.
 *
 * So the fields only one side selects are OPTIONAL here, and the catalog names
 * them all. A resolver that finds nothing returns `null` and the cell dashes —
 * the honest answer, and the same rule a stale binding already follows.
 *
 * `allocated_at` / `released_at` are ISO STRINGS, not `Date`s: the slot
 * resolver's law is that the same row resolves the same text at any time (see
 * `inventory-events-resolve.ts`), and an instant that has to survive an RSC
 * boundary is a string on both sides of it.
 *
 * Field names stay snake_case — the wire names, which is what lets both desks
 * hand their existing rows straight to the family with no mapper.
 */

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
