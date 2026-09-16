/**
 * One row of the `unit-tsn-links` family — a `tech_serial_numbers` cross-ref
 * for one serial unit, wire-safe.
 *
 * The legacy v1 audit table. A row is one time the v1 tech station wrote a
 * serial down, and the unit detail paints them so an operator joining v1
 * station logs to a v2 lifecycle can see both ends of the same serial.
 *
 * `created_at` is an ISO STRING for the same reason every other family's stamp
 * is: a resolver must answer the same text for the same row at any time.
 *
 * `fnsku` is on the wire and was never painted — a deliberate non-goal, not an
 * oversight. The catalog names no path for it and `unit-tsn-links.test.ts`
 * pins that; add it the day a desk asks.
 */

/** The TSN link row — what the catalog, resolver and adapter read. */
export interface UnitTsnLinkTableRow {
  /** `tech_serial_numbers.id` — the row key AND the identity fact. */
  id: number;
  created_at: string;
  /** Which v1 station wrote the row. `null` for pre-station records. */
  station_source: string | null;
  /** `tech_serial_numbers.serial_type` — the kind of serial recorded. */
  serial_type: string;
  shipment_id: number | null;
  /** Staff name from the join; `null` when the tester was never attributed. */
  tested_by_name: string | null;
  /** Fetched, never painted. See the docblock. */
  fnsku?: string | null;
}
