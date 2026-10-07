/**
 * Display vocabulary of the import record — the labels and doors every import
 * surface (desk card lists, run record, phone screens) reads, so the desk and the
 * phone say the same word for the same fact. State faces:
 * `@/design-system/tokens/import-record-lifecycle`.
 */

import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import type { ImportRunListItem, ImportRunRowItem, ImportRunStatus, ImportRunTotals, ImportStepCounts } from '@/lib/imports/types';
import { formatMonthDayTimePST } from '@/utils/date';

export const IMPORTS_PATH = '/operations/imports';
export const MOBILE_IMPORTS_PATH = '/m/imports';

/** `orders` columns an import fills, as the operator names them. */
const FILLED_FIELD_LABEL: Readonly<Record<string, string>> = {
  item_number: 'Item #',
  sku: 'SKU',
  condition: 'Condition',
  quantity: 'Qty',
  notes: 'Notes',
  ship_by: 'Ship by',
  sale_amount: 'Sale amount',
  currency: 'Currency',
  shipment_id: 'Tracking link',
  customer_id: 'Customer',
  account_source: 'Account',
};

export function filledFieldLabel(field: string): string {
  return FILLED_FIELD_LABEL[field] ?? field.replace(/_/g, ' ');
}

/** A step / source name (`shipstation`, `google_sheets`, `exceptions`) as its catalog label. */
export function importSourceLabel(source: string): string {
  return source === 'exceptions' ? 'Exceptions' : providerCatalogLabel(source);
}

/** `Scheduled` or `Manual · <name>`. */
export function importTriggerLabel(run: Pick<ImportRunListItem, 'trigger' | 'triggeredBy'>): string {
  if (run.trigger === 'cron') return 'Scheduled';
  return run.triggeredBy ? `Manual · ${run.triggeredBy.name}` : 'Manual';
}

const KIND_LABEL: Readonly<Record<ImportRunListItem['kind'], string>> = {
  pipeline: 'Orders pipeline',
  provider: 'Single channel',
  sheets_full: 'Sheets history',
};

export function importKindLabel(kind: ImportRunListItem['kind']): string {
  return KIND_LABEL[kind];
}

/** A run's status as the Runs chips and the sidebar's Status facet name it. */
export const IMPORT_RUN_STATUS_LABELS: Readonly<Record<ImportRunStatus, string>> = {
  running: 'Running',
  success: 'Success',
  partial: 'Partial',
  failed: 'Failed',
};

/** `Sep 28, 3:04 PM` in warehouse time (PT). */
export function importStamp(iso: string | null): string {
  return formatMonthDayTimePST(iso);
}

export function importDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** Where the row came from inside its source: `Sheet_09_28_2026:14` or `ShipStation 123456`. */
export function importRowLocator(row: Pick<ImportRunRowItem, 'sheetTab' | 'sheetRow' | 'shipstationOrderId' | 'shipstationShipmentId'>): string | null {
  if (row.sheetTab) return row.sheetRow != null ? `${row.sheetTab}:${row.sheetRow}` : row.sheetTab;
  if (row.shipstationOrderId != null) return `ShipStation ${row.shipstationOrderId}`;
  if (row.shipstationShipmentId != null) return `ShipStation shipment ${row.shipstationShipmentId}`;
  return null;
}

/**
 * Why a writer skipped, held or failed a row (`order_import_run_rows.reason`),
 * as the operator reads it. Every code the writers emit: the sheet reader
 * (`google-sheets-orders.ts`), ShipStation orders and tracking
 * (`shipstation-orders.ts`, `shipstation-tracking.ts`) and the canonical
 * ingest via `from-transfer-details.ts`.
 */
const IMPORT_ROW_REASON_LABEL: Readonly<Record<string, string>> = {
  noTracking: 'No tracking',
  fbaShipment: 'FBA shipment',
  duplicate: 'Duplicate paste',
  ambiguous_match: 'Ambiguous match',
  no_platform: 'No platform',
  cancelled: 'Cancelled',
  awaiting_payment: 'Awaiting payment',
  ignored_exception: 'Ignored in Review',
  shipstation_unknown_store: 'ShipStation: unknown store',
  shipstation_ambiguous_match: 'ShipStation: ambiguous match',
  tracking_attach_failed: 'Tracking not attached',
};

/** A row's reason as a label; a code no writer maps yet reads as words (`some_code` → `Some code`), free text as written. */
export function importRowReasonLabel(reason: string): string {
  const known = IMPORT_ROW_REASON_LABEL[reason];
  if (known) return known;
  if (/\s/.test(reason.trim())) return reason.trim();
  const words = reason.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The title slot of a row with no listing title — the To-ship card's own placeholder. */
export const IMPORT_ROW_UNTITLED = 'Untitled line';

/** The door into the order the row landed on, or null for a refused row. */
export function importOrderHref(orderRowId: number | null): string | null {
  return orderRowId != null ? `/shipping/orders?openOrderId=${orderRowId}` : null;
}

/** Retained product-pairing door while the import-exception table is parked. */
export function importReviewHref(_importExceptionId: number): string {
  return '/products?view=pairing';
}

/** One step's counts as a sentence of the non-zero facts (`3 new · 2 updated`). */
export function importStepCountsLine(counts: ImportStepCounts): string {
  const parts = [
    counts.imported ? `${counts.imported} new` : null,
    counts.updated ? `${counts.updated} updated` : null,
    counts.trackingFilled ? `${counts.trackingFilled} tracking` : null,
    counts.ambiguous ? `${counts.ambiguous} to review` : null,
    counts.skipped ? `${counts.skipped} skipped` : null,
    counts.failed ? `${counts.failed} failed` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing new';
}

/** A run's totals as a sentence of the non-zero facts (`12 inserted · 30 backfilled · 4 tracking · 2 to review`). */
export function importRunTotalsLine(totals: ImportRunTotals): string {
  const parts = [
    totals.inserted ? `${totals.inserted} inserted` : null,
    totals.backfilled ? `${totals.backfilled} backfilled` : null,
    totals.trackingFilled ? `${totals.trackingFilled} tracking` : null,
    totals.needsReview ? `${totals.needsReview} to review` : null,
    totals.skipped ? `${totals.skipped} skipped` : null,
    totals.failed ? `${totals.failed} failed` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing new';
}
