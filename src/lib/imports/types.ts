/**
 * Import record — the shared vocabulary of `order_import_runs`,
 * `order_import_run_steps` and `order_import_run_rows` (owner 2026-09-28:
 * "exactly which ids came in through each import").
 *
 * Writers (connectors via `ingestCanonicalOrders`) emit {@link ImportRowRecord}
 * on `SyncOutcome.importRows`; the recorder (`src/lib/sync/import-record.ts`)
 * persists them; the read side (`src/lib/imports/queries.ts`) serves them to
 * `/operations/imports` and `/m/imports`.
 */

export const IMPORT_ROW_OUTCOMES = [
  'inserted',
  'backfilled',
  'adopted',
  'claimed',
  'tracking_filled',
  'unchanged',
  'ambiguous',
  'quarantined',
  'skipped',
  'failed',
] as const;
export type ImportRowOutcome = (typeof IMPORT_ROW_OUTCOMES)[number];

export const IMPORT_RUN_KINDS = ['pipeline', 'provider', 'sheets_full'] as const;
export type ImportRunKind = (typeof IMPORT_RUN_KINDS)[number];

export const IMPORT_RUN_TRIGGERS = ['cron', 'manual'] as const;
export type ImportRunTrigger = (typeof IMPORT_RUN_TRIGGERS)[number];

export const IMPORT_RUN_STATUSES = ['running', 'success', 'partial', 'failed'] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

/** One order the import touched. `source` is stamped by the recorder from the step. */
export interface ImportRowRecord {
  /** `orders.id`; null only for refused / ambiguous / skipped rows. */
  orderRowId: number | null;
  /** `orders.order_id` / the channel's order number. */
  externalOrderId: string;
  accountSource: string | null;
  /** Catalog platform slug (`platformOf`). */
  platform: string | null;
  outcome: ImportRowOutcome;
  /** Skip / quarantine / ambiguity reason (`noTracking`, `fbaShipment`, …). */
  reason?: string | null;
  /** `orders` columns this import filled (`item_number`, `sku`, `ship_by`, …). */
  filledFields?: string[];
  trackingNumber?: string | null;
  /** `shipping_tracking_numbers.id`. */
  shipmentId?: number | null;
  skuCatalogId?: number | null;
  itemNumber?: string | null;
  shipstationOrderId?: number | null;
  shipstationShipmentId?: number | null;
  /** Google Sheets: `Sheet_MM_DD_YYYY`. */
  sheetTab?: string | null;
  /** Google Sheets: 1-based row. */
  sheetRow?: number | null;
  /** `order_import_exceptions.id` when the row was parked for review. */
  importExceptionId?: number | null;
}

/** Per-step (and per-run, summed) counts. Derived from the step's rows when it has any. */
export interface ImportStepCounts {
  imported: number;
  updated: number;
  trackingFilled: number;
  ambiguous: number;
  skipped: number;
  failed: number;
}

// ── Read side (API response shapes) ─────────────────────────────────────────

export interface ImportRunTotals {
  inserted: number;
  backfilled: number;
  trackingFilled: number;
  /** ambiguous + quarantined — what an operator must review. */
  needsReview: number;
  skipped: number;
  failed: number;
}

export interface ImportRunListItem {
  id: number;
  kind: ImportRunKind;
  trigger: ImportRunTrigger;
  triggeredBy: { staffId: number; name: string } | null;
  status: ImportRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  /** Step names that ran, in order, excluding `exceptions`. */
  sources: string[];
  totals: ImportRunTotals;
  error: string | null;
  cronRunId: number | null;
}

export interface ImportRunStep {
  id: number;
  step: string;
  ok: boolean;
  counts: ImportStepCounts;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ImportRunDetail extends ImportRunListItem {
  steps: ImportRunStep[];
}

export interface ImportRunRowItem {
  id: number;
  runId: number;
  stepId: number | null;
  orderRowId: number | null;
  externalOrderId: string;
  accountSource: string | null;
  platform: string | null;
  source: string;
  outcome: ImportRowOutcome;
  reason: string | null;
  filledFields: string[];
  trackingNumber: string | null;
  shipmentId: number | null;
  skuCatalogId: number | null;
  itemNumber: string | null;
  /** Read through `resolveSkuIdentityTitle`; never stored on the row. */
  title: string | null;
  shipstationOrderId: number | null;
  shipstationShipmentId: number | null;
  sheetTab: string | null;
  sheetRow: number | null;
  importExceptionId: number | null;
  createdAt: string;
}

export interface ImportPage<T> {
  ok: true;
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
