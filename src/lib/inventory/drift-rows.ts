/**
 * The two DRIFT desk rows — `/inventory/health`'s reconciliation feeds, wire-safe.
 *
 * Lifted out of `_inventory-admin/inventory-admin-data.ts` on 2026-09-12
 * (Wave D) so the RSC page, the client island, the slot resolvers and the
 * adapters all name the same shapes. The page is a server component and
 * `DataTable` is client code, so these are the types that cross the boundary.
 *
 * Two feeds, two entities, and deliberately not one:
 *
 * - {@link SkuDriftRow} is a LIVE comparison — one row of `v_sku_stock_drift`,
 *   which exists only while `sku_stock` disagrees with the ledger sums. It has
 *   no id and no timestamp of its own: the view is a join computed at read
 *   time, so the SKU *is* the row's identity and there is no instant to paint.
 * - {@link DriftAlertRow} is a RECORD — one open `stock_alerts` row the
 *   drift-check cron opened about a SKU, with its own id, its own trigger
 *   stamp and the prose it wrote. Same subject, different entity.
 *
 * `triggered_at` normalizes to an ISO STRING, not a `Date`: a slot resolver's
 * law is that the same row resolves the same text at any time (see
 * `inventory-events-resolve.ts`), and an instant that has to survive the RSC
 * boundary is a string on both sides of it. `SkuDriftRow` needs no normalizer —
 * every fact on it is already a scalar.
 *
 * Field names stay snake_case: they are the wire names the catalogs document in
 * their `paths`, which is what keeps a resolver's contract greppable against
 * the SQL that feeds it.
 */

/**
 * One row of `v_sku_stock_drift` — a SKU whose stored counters disagree with
 * its ledger sums, in both dimensions.
 *
 * `organization_id` is selected by the view and is NOT here: the loader scopes
 * by org and no cell ever painted it.
 */
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

/**
 * The desk row — what the client island and the family resolver read.
 *
 * `alert_type`, `resolved_at`, `threshold`, `bin_id` and `notified_at` are
 * columns `stock_alerts` HAS and this desk does not select: the query pins
 * `alert_type = 'DRIFT' AND resolved_at IS NULL`, so both are constants here
 * rather than facts, and the other three belong to the bin-level alert types.
 * A fact nothing paints is not a row field.
 */
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
