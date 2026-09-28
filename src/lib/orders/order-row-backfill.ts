/**
 * The additive backfill of ONE existing `orders` row by an incoming canonical order — pure, so the ingest writer's update rules (and the…
 * Price + currency are first-write-wins (operator ruling 2026-09-15).
 */
import { resolveSaleAmountWrite } from '@/lib/orders/canonical-order';

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** The existing-row fields the backfill reads. */
export interface BackfillRow {
  orderId: string | null;
  itemNumber: string | null;
  productTitle: string | null;
  quantity: string | null;
  sku: string | null;
  condition: string | null;
  notes: string | null;
  customerId: number | null;
  shipmentId: number | null;
  accountSource: string | null;
  status: string | null;
  /** Current catalog link; when known, an equal incoming link is not rewritten. */
  skuCatalogId?: number | null;
  saleAmount?: string | null;
  currency?: string | null;
}

/** The incoming order, after catalog + customer + tracking resolution. */
export interface BackfillIncoming {
  orderId: string;
  itemNumber: string;
  productTitle: string;
  sku: string;
  skuCatalogId: number | null;
  quantity: string;
  condition: string;
  notes: string;
  status: string | null;
  saleAmount: string | null;
  currency: string | null;
  accountSource: string;
  customerId: number | null;
  shipmentIds: number[];
}

export interface BackfillPolicy {
  titleAuthoritative: boolean;
  statusAuthoritative: boolean;
  /**
   * `fill` stamps a blank account_source; `rekey` overwrites it (a marketplace
   * taking over the aggregator's row); `keep` never touches it (the aggregator
   * adopting a marketplace row).
   */
  sourceWrite: 'fill' | 'rekey' | 'keep';
}

interface BackfillPlan {
  /** Column writes (camelCase `orders` fields); empty = nothing to update. */
  values: Record<string, unknown>;
  /** The row's primary shipment after the write (existing wins). */
  primaryShipmentId: number | null;
  /** True when the row had no shipment and this write gives it one. */
  filledShipment: boolean;
}

export function planOrderRowBackfill(
  row: BackfillRow,
  incoming: BackfillIncoming,
  policy: BackfillPolicy,
): BackfillPlan {
  const values: Record<string, unknown> = {};
  if (isBlank(row.orderId) && incoming.orderId) values.orderId = incoming.orderId;
  if (isBlank(row.itemNumber) && incoming.itemNumber) values.itemNumber = incoming.itemNumber;
  if (policy.titleAuthoritative
    ? !!incoming.productTitle
    : isBlank(row.productTitle) && !!incoming.productTitle) {
    values.productTitle = incoming.productTitle;
  }
  if (
    policy.statusAuthoritative
    && incoming.status
    && incoming.status !== row.status
    && (isBlank(row.status) || row.status === 'unassigned')
  ) {
    values.status = incoming.status;
  }
  if (isBlank(row.quantity) && incoming.quantity) values.quantity = incoming.quantity;
  if (isBlank(row.sku) && incoming.sku) values.sku = incoming.sku;
  if (isBlank(row.condition) && incoming.condition) values.condition = incoming.condition;
  if (isBlank(row.notes) && incoming.notes) values.notes = incoming.notes;
  if (
    incoming.skuCatalogId != null
    && (isBlank(row.sku) || isBlank(row.itemNumber))
    && (row.skuCatalogId === undefined || Number(row.skuCatalogId) !== incoming.skuCatalogId)
  ) {
    values.skuCatalogId = incoming.skuCatalogId;
  }

  // A sale price is an immutable fact of the sale: a source value writes only
  // onto a row that has none, so a re-sync can never clobber a manual
  // correction. Currency is part of the same fact.
  const saleAmountWrite = resolveSaleAmountWrite(
    incoming.saleAmount,
    row.saleAmount == null ? null : String(row.saleAmount),
  );
  if (saleAmountWrite != null) values.saleAmount = saleAmountWrite;
  if (incoming.currency && isBlank(row.currency)) values.currency = incoming.currency;

  const primaryShipmentId =
    (row.shipmentId != null ? Number(row.shipmentId) : null) ?? incoming.shipmentIds[0] ?? null;
  const filledShipment = row.shipmentId == null && primaryShipmentId != null;
  if (filledShipment) values.shipmentId = primaryShipmentId;
  if (row.customerId == null && incoming.customerId) values.customerId = incoming.customerId;
  if (
    incoming.accountSource
    && (policy.sourceWrite === 'rekey' || (policy.sourceWrite === 'fill' && isBlank(row.accountSource)))
  ) {
    values.accountSource = incoming.accountSource;
  }

  return { values, primaryShipmentId, filledShipment };
}

/** `orders` column for a {@link planOrderRowBackfill} `values` key (`itemNumber` → `item_number`). */
function orderColumnName(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * The snake_case `orders` columns a backfill write actually CHANGES — the
 * import record's `filled_fields`. A key whose value equals the row's current
 * one (an authoritative title re-sent unchanged) is not a fill, so a re-sync
 * over current data records nothing.
 */
export function filledOrderColumns(row: BackfillRow, values: Record<string, unknown>): string[] {
  const current = row as unknown as Record<string, unknown>;
  return Object.keys(values)
    .filter((key) => values[key] !== undefined)
    .filter((key) => String(current[key] ?? '').trim() !== String(values[key] ?? '').trim())
    .map(orderColumnName);
}
