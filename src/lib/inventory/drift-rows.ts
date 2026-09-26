/** The two DRIFT desk rows — `/inventory/health`'s reconciliation feeds, wire-safe. */

/** One row of `v_sku_stock_drift` — a SKU whose stored counters disagree with its ledger sums, in both dimensions. */
export interface SkuDriftRow {
  sku: string;
  /** `sku_stock.stock` — the stored warehouse counter. */
  stored_stock: number;
  /** `SUM(delta) WHERE dimension = 'WAREHOUSE'`. */
  ledger_warehouse: number;
  /** `stored_stock - ledger_warehouse`. Signed: the direction is the fact. */
  warehouse_drift: number;
  /** `sku_stock.boxed_stock` — the stored boxed counter. */
  stored_boxed: number;
  /** `SUM(delta) WHERE dimension = 'BOXED'`. */
  ledger_boxed: number;
  /** `stored_boxed - ledger_boxed`. Signed. */
  boxed_drift: number;
}

/** The raw `SELECT` shape `loadOpenDriftAlerts` reads out of `stock_alerts`. */
export interface DriftAlertQueryRow {
  id: number;
  sku: string;
  qty_at_trigger: number | null;
  triggered_at: Date | string;
  notes: string | null;
}

/** The desk row — what the client island and the family resolver read. */
export interface DriftAlertRow {
  id: number;
  sku: string;
  /** `GREATEST(ABS(warehouse_drift), ABS(boxed_drift))` at trigger time. */
  qty_at_trigger: number | null;
  /** Absolute instant, ISO-8601. */
  triggered_at: string;
  /** The cron's own prose: `drift: warehouse stored=… ledger=… (Δ=…) ; boxed …`. */
  notes: string | null;
}

/** Query row → desk row. Pure; the only place `Date` is read. */
export function toDriftAlertRow(raw: DriftAlertQueryRow): DriftAlertRow {
  const triggered = raw.triggered_at;
  return {
    id: raw.id,
    sku: raw.sku,
    qty_at_trigger: raw.qty_at_trigger,
    triggered_at:
      triggered instanceof Date ? triggered.toISOString() : String(triggered ?? '').trim(),
    notes: raw.notes,
  };
}
