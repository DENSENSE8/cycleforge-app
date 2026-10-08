/** One order's shipping label, as the To-ship evidence column shows it — `GET /api/orders/[id]/label-purchase`. */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { G3_LABEL_EXISTS_SQL, G3_LABEL_PURCHASED_SQL } from '@/lib/orders/caged-orders';
import { positiveOrNull, resolveParcelWithSource, PARCEL_FALLBACK_SELECT_SQL, parcelFallbackJoinSql, type ParcelFallbackColumns } from '@/lib/orders/parcel-dims';
import type { LabelPurchaseStatus } from '@/lib/shipping/label-purchase-ledger';
import { listOrderLabels, type OrderLabelEntry } from '@/lib/shipping/order-label-links';
import { resolveOrderShipTo } from '@/lib/shipping/shipstation/order-ship-to';
import type { ShipAddress } from '@/lib/shipping/shipstation/types';

export type OrderLabelStatus = 'none' | 'bought' | 'pending' | 'linked' | 'voided';

/** The ledger row the status reads from (the current purchase for the order). */
export interface OrderLabelPurchase {
  status: LabelPurchaseStatus;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  currency: string | null;
  trackingNumber: string | null;
  labelDocumentId: number | null;
  /** When the purchase was claimed — moments before the charge. ISO. */
  boughtAt: string | null;
  boughtBy: { id: number; name: string | null } | null;
}

export interface OrderLabelSummary {
  orderId: number;
  status: OrderLabelStatus;
  purchase: OrderLabelPurchase | null;
  /** Every label on the order, oldest first. */
  labels: OrderLabelEntry[];
  /** The address a label buys to (ShipStation's own ship-to, else the customer cache). */
  shipTo: ShipAddress | null;
  /** The stored parcel (order row → SKU → item number, first with any value) — the prefill a replacement reuses. */
  parcel: {
    weightOz: number | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
  };
}

export type OrderLabelRow = {
  id: number | string;
  order_id: string | null;
  account_source: string | null;
  customer_id: number | null;
  parcel_weight_oz: string | number | null;
  parcel_length_in: string | number | null;
  parcel_width_in: string | number | null;
  parcel_height_in: string | number | null;
  label_linked: boolean | null;
  label_bought_document: boolean | null;
  purchase_status: LabelPurchaseStatus | null;
  carrier_code: string | null;
  service_code: string | null;
  cost: string | number | null;
  currency: string | null;
  tracking_number: string | null;
  label_document_id: number | null;
  bought_at: Date | string | null;
  purchased_by: number | null;
  purchased_by_name: string | null;
} & ParcelFallbackColumns

export interface OrderLabelSummaryDeps {
  /** The order's label facts; `null` when the order is not in this org. */
  readRow(orgId: OrgId, orderId: number): Promise<OrderLabelRow | null>;
  readLabels(orgId: OrgId, orderId: number): Promise<OrderLabelEntry[]>;
  /** The ship-to a label buys to — the same resolution the rate-shop uses. */
  readShipTo(orgId: OrgId, order: { id: number; order_id: string | null; account_source: string | null; customer_id: number | null }): Promise<ShipAddress | null>;
}

function deriveOrderLabelStatus(facts: {
  purchaseStatus: LabelPurchaseStatus | null;
  labelLinked: boolean;
  labelBoughtDocument: boolean;
}): OrderLabelStatus {
  if (facts.purchaseStatus === 'purchased' || facts.labelBoughtDocument) return 'bought';
  if (facts.purchaseStatus === 'pending') return 'pending';
  if (facts.labelLinked) return 'linked';
  if (facts.purchaseStatus === 'voided') return 'voided';
  return 'none';
}

function summaryFromRow(
  row: OrderLabelRow,
  labels: OrderLabelEntry[] = [],
  shipTo: ShipAddress | null = null,
): OrderLabelSummary {
  const purchase: OrderLabelPurchase | null = row.purchase_status
    ? {
        status: row.purchase_status,
        carrierCode: row.carrier_code,
        serviceCode: row.service_code,
        cost: row.cost == null ? null : Number(row.cost),
        currency: row.currency,
        trackingNumber: row.tracking_number,
        labelDocumentId: row.label_document_id,
        boughtAt: row.bought_at == null ? null : new Date(row.bought_at).toISOString(),
        boughtBy:
          row.purchased_by == null ? null : { id: row.purchased_by, name: row.purchased_by_name },
      }
    : null;
  // Order row → SKU → item number; the replacement dialog reuses whatever the
  // order already knows about its box (first tier holding any value wins).
  const parcel = resolveParcelWithSource(
    {
      weightOz: positiveOrNull(row.parcel_weight_oz),
      lengthIn: positiveOrNull(row.parcel_length_in),
      widthIn: positiveOrNull(row.parcel_width_in),
      heightIn: positiveOrNull(row.parcel_height_in),
    },
    row,
  );
  return {
    orderId: Number(row.id),
    status: deriveOrderLabelStatus({
      purchaseStatus: row.purchase_status,
      labelLinked: row.label_linked === true,
      labelBoughtDocument: row.label_bought_document === true,
    }),
    purchase,
    labels,
    shipTo,
    parcel: {
      weightOz: parcel.weightOz,
      lengthIn: parcel.lengthIn,
      widthIn: parcel.widthIn,
      heightIn: parcel.heightIn,
    },
  };
}

// The current purchase: the outbound label BOUGHT HERE — a bought label beats
// an unresolved claim beats a voided one; newest first within each. A paired
// outbound / replacement label (import or Link label) reads as `linked`.
const ORDER_LABEL_SQL = `
  SELECT
    o.id,
    o.order_id,
    o.account_source,
    o.customer_id,
    o.parcel_weight_oz,
    o.parcel_length_in,
    o.parcel_width_in,
    o.parcel_height_in,
    ${PARCEL_FALLBACK_SELECT_SQL},
    (${G3_LABEL_EXISTS_SQL}) OR EXISTS (
      SELECT 1 FROM shipping_label_purchases lk
       WHERE lk.organization_id = o.organization_id
         AND lk.order_id = o.id
         AND lk.creation_type <> 'bought_in_app'
         AND lk.purpose IN ('outbound', 'replacement')
         AND lk.status = 'purchased'
    )                         AS label_linked,
    ${G3_LABEL_PURCHASED_SQL} AS label_bought_document,
    p.status                  AS purchase_status,
    p.carrier_code,
    p.service_code,
    p.cost,
    p.currency,
    p.tracking_number,
    p.label_document_id,
    p.created_at              AS bought_at,
    p.purchased_by,
    s.name                    AS purchased_by_name
  FROM orders o
  LEFT JOIN LATERAL (
    SELECT lp.*
      FROM shipping_label_purchases lp
     WHERE lp.organization_id = o.organization_id
       AND lp.order_id = o.id
       AND lp.creation_type = 'bought_in_app'
       AND lp.purpose = 'outbound'
     ORDER BY CASE lp.status WHEN 'purchased' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
              lp.created_at DESC,
              lp.id DESC
     LIMIT 1
  ) p ON TRUE
  LEFT JOIN staff s ON s.id = p.purchased_by AND s.organization_id = o.organization_id
  ${parcelFallbackJoinSql('o')}
  WHERE o.id = $1 AND o.organization_id = $2
  LIMIT 1
`;

const defaultOrderLabelSummaryDeps: OrderLabelSummaryDeps = {
  readRow: async (orgId, orderId) => {
    const res = await tenantQuery<OrderLabelRow>(orgId, ORDER_LABEL_SQL, [orderId, orgId]);
    return res.rows[0] ?? null;
  },
  readLabels: listOrderLabels,
  readShipTo: async (orgId, order) => (await resolveOrderShipTo(orgId, order)).shipTo,
};

/** The order's label summary; `null` when the order is not in this org. */
export async function getOrderLabelSummary(
  orgId: OrgId,
  orderId: number,
  deps: OrderLabelSummaryDeps = defaultOrderLabelSummaryDeps,
): Promise<OrderLabelSummary | null> {
  const row = await deps.readRow(orgId, orderId);
  if (!row) return null;
  const [labels, shipTo] = await Promise.all([
    deps.readLabels(orgId, orderId),
    deps.readShipTo(orgId, {
      id: Number(row.id),
      order_id: row.order_id,
      account_source: row.account_source,
      customer_id: row.customer_id,
    }),
  ]);
  return summaryFromRow(row, labels, shipTo);
}
