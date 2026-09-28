/**
 * The writer's per-row detail (`TransferOrderDetails`, from
 * `ingestCanonicalOrders` and the connectors) → the import record's rows
 * (`ImportRowRecord`, `SyncOutcome.importRows`). Pure.
 */
import type { TransferOrderDetail, TransferOrderDetails } from '@/lib/orders-sync/types';
import type { PlatformOf } from '@/lib/orders/order-source-match';
import type { ImportRowOutcome, ImportRowRecord } from './types';

export interface ImportRowsExtra {
  /** Account source → catalog platform slug; absent = platform unknown (null). */
  platformOf?: PlatformOf;
  /** Ids only the caller knows for a row (sheet tab / row, ShipStation order id). */
  decorate?: (detail: TransferOrderDetail) => Partial<ImportRowRecord>;
}

type DetailBuckets = Pick<TransferOrderDetails, 'inserted' | 'updated'> &
  Partial<Pick<TransferOrderDetails, 'quarantined' | 'ambiguous'>>;

function toRow(detail: TransferOrderDetail, outcome: ImportRowOutcome, extra: ImportRowsExtra): ImportRowRecord {
  const accountSource = detail.accountSource ?? detail.platform ?? null;
  return {
    orderRowId: detail.orderRowId ?? null,
    externalOrderId: detail.orderId,
    accountSource,
    platform: extra.platformOf?.(accountSource) ?? null,
    outcome,
    reason: detail.quarantineReason ?? null,
    filledFields: detail.filledFields ?? [],
    trackingNumber: detail.tracking || null,
    shipmentId: detail.shipmentId ?? null,
    skuCatalogId: detail.skuCatalogId ?? null,
    itemNumber: detail.itemNumber || null,
    importExceptionId: detail.importExceptionId ?? null,
    ...extra.decorate?.(detail),
  };
}

/** A backfill whose only change is the shipment link is a tracking fill;
 *  otherwise adopt / claim / plain backfill as the writer matched it. */
function backfillOutcome(detail: TransferOrderDetail, filled: readonly string[]): ImportRowOutcome {
  if (filled.length === 1 && filled[0] === 'shipment_id') return 'tracking_filled';
  return detail.outcome === 'adopted' || detail.outcome === 'claimed' ? detail.outcome : 'backfilled';
}

/**
 * Every order the write touched: inserted rows, backfilled rows that changed
 * at least one column (a backfill that changed nothing is no row — a re-sync
 * over current data records nothing), quarantined and ambiguous orders.
 * Collapse deletions and the `unknownTitle` / `unresolvedTracking` /
 * `unmatchedCatalog` views are the same orders again, not rows of their own.
 */
export function importRowsFromTransferDetails(details: DetailBuckets, extra: ImportRowsExtra = {}): ImportRowRecord[] {
  const rows: ImportRowRecord[] = [];
  for (const d of details.inserted) rows.push(toRow(d, 'inserted', extra));
  for (const d of details.updated) {
    const filled = d.filledFields ?? [];
    if (filled.length > 0) rows.push(toRow(d, backfillOutcome(d, filled), extra));
  }
  for (const d of details.quarantined ?? []) {
    rows.push({ ...toRow(d, d.outcome === 'ambiguous' ? 'ambiguous' : 'quarantined', extra), orderRowId: null });
  }
  for (const d of details.ambiguous ?? []) rows.push({ ...toRow(d, 'ambiguous', extra), orderRowId: null });
  return rows;
}
