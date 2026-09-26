/** One row of the `sku-ledger` family — a single `sku_stock_ledger` entry, wire-safe. */

/** The per-SKU ledger row — what the catalog, resolver and adapter read. */
export interface SkuLedgerTableRow {
  /** `sku_stock_ledger.id` — the row key, never painted as a fact. */
  id: number;
  /** ISO instant the movement was recorded. */
  created_at: string;
  /** Signed quantity change. Never null (`NOT NULL` in the schema). */
  delta: number;
  /**
   * Free-form reason code ('SALE', 'ADJUSTMENT', 'TAKE_FBA', …). `NOT NULL`.
   * Painted through `takeReasonLedgerLabel`, never as the raw take code.
   */
  reason: string;
  /** What somebody wrote about this movement; trimmed, empty ⇒ `null`. */
  notes: string | null;
  /** `WAREHOUSE` | `BOXED` — which quantity bucket moved. `NOT NULL`. */
  dimension: string;
  /**
   * The staffer behind the write. `staff_id` is `null` for a machine write,
   * which is what lets the person face draw the absence honestly instead of
   * printing the `'system'` sentinel the retired cell invented.
   */
  staff_id: number | null;
  staff_name: string | null;
  /** The order this movement belongs to — the IDENTITY fact. */
  ref_order_id: number | null;
  ref_receiving_line_id: number | null;
  ref_serial_unit_id: number | null;
}
