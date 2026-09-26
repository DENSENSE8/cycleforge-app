/** One row of the `unit-tsn-links` family — a `tech_serial_numbers` cross-ref for one serial unit, wire-safe. */

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
