/**
 * Buy ONE ShipStation label outright — no order required (`/api/v1/label-buys`).
 *
 * Reuses the reference-label pieces (label-intake.ts): the customer ↔ warehouse
 * shipment, the rate quote, and the purchase ledger's `purchaseLabelOnce` keyed
 * by `clientEventId` — a retry never buys twice. The ledger row carries no
 * order (`order_id` NULL) and the free-text reference as `order_ref` when one
 * was typed (NULL otherwise; the column is nullable since 2026-09-25f).
 *
 * A reference that exactly names an order number binds the purchase to that
 * order and finishes it the order path's way (`finishLabelPurchase`: tracking,
 * documents, the Labels-desk ingestion paired to the order). Otherwise the
 * label lands on the Labels desk unpaired (a "No order" card) through
 * `recordPurchaseLabelIngestion`.
 *
 * Everything after the charge is best-effort and surfaces as `warning`.
 */

import 'server-only';
import type { NextResponse } from 'next/server';
import { v1Error } from '@/lib/api/v1-route';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { itemKeySql, positiveOrNull, rememberParcelDims, skuKeySql } from '@/lib/orders/parcel-dims';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { intakeParcelFrom, rateReferenceLabel, referenceShipmentSpec } from '@/lib/shipping/label-intake';
import { attachLabelPurchaseFacts, purchaseLabelOnce, type LabelPurchaseRecord } from '@/lib/shipping/label-purchase-ledger';
import { recordPurchaseLabelIngestion } from '@/lib/shipping/label-purchase-ingestion';
import {
  finishLabelPurchase,
  loadLabelOrder,
  purchasedLabelFromRecord,
  type LabelOrderRow,
  type PurchasedLabel,
} from '@/lib/shipping/order-label-purchase';
import type { LabelPurpose } from '@/lib/shipping/label-purpose';
import { getShipStationV2, ShipFromNotConfiguredError, ShipStationNotConnectedError } from '@/lib/shipping/shipstation/config';
import { ShipStationApiError, ShipStationTestModeError, type ShipStationV2Client } from '@/lib/shipping/shipstation/client';
import { toParcel, toShipAddress } from '@/lib/shipping/shipstation/rate-request';
import type { LabelPurchaseResult, Parcel } from '@/lib/shipping/shipstation/types';
import {
  MAX_LABEL_BUY_PRODUCTS,
  toLabelBuyProduct,
  type LabelBuyInput,
  type LabelBuyProduct,
  type LabelBuyRates,
  type LabelBuyRatesInput,
  type LabelBuyResult,
} from './contracts';

const LABEL_FORMAT = 'pdf' as const;

// ── Rates ──────────────────────────────────────────────────────────────────

export async function rateLabelBuy(orgId: OrgId, body: LabelBuyRatesInput): Promise<LabelBuyRates> {
  const result = await rateReferenceLabel(orgId, {
    purpose: body.purpose,
    customer: toShipAddress(body.shipTo),
    parcel: toParcel(body.parcel),
  });
  return {
    rates: result.rates,
    invalidRates: result.invalidRates.map((r) => ({
      carrierCode: r.carrierCode ?? null,
      serviceCode: r.serviceCode ?? null,
      message: r.message,
    })),
  };
}

// ── Buy ────────────────────────────────────────────────────────────────────

export type LabelBuyOutcome =
  | {
      kind: 'bought';
      result: LabelBuyResult;
      /** The order the reference named (the purchase is bound to it), else null. */
      orderId: number | null;
      purpose: LabelPurpose;
      label: PurchasedLabel;
      /** The order's tracking row the label registered, when bound. */
      shipmentId: number | null;
      /** First label document stored for the bound order. */
      isFirstLabel: boolean;
    }
  | { kind: 'in_flight' }
  | { kind: 'voided' };

/** The order whose number the reference names exactly (lowest row id), else null. */
async function findOrderByNumber(orgId: OrgId, ref: string): Promise<LabelOrderRow | null> {
  const res = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT id FROM orders WHERE organization_id = $1 AND order_id = $2 ORDER BY id ASC LIMIT 1`,
    [orgId, ref],
  );
  const id = res.rows[0]?.id;
  return id == null ? null : loadLabelOrder(orgId, Number(id));
}

/** The order's latest bought outbound label — some carriers want it on the return. */
async function latestOutboundLabelId(orgId: OrgId, orderId: number): Promise<string | null> {
  const res = await tenantQuery<{ label_id: string }>(
    orgId,
    `SELECT label_id FROM shipping_label_purchases
      WHERE organization_id = $1 AND order_id = $2 AND purpose = 'outbound'
        AND status = 'purchased' AND label_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [orgId, orderId],
  );
  return res.rows[0]?.label_id ?? null;
}

/** After the charge, no order: the label on the Labels desk, unpaired. */
async function finishOrderless(input: {
  orgId: OrgId;
  v2: ShipStationV2Client;
  label: PurchasedLabel;
  purpose: LabelPurpose;
  staffId: number | null;
}): Promise<{ labelIngestionId: number | null; warning: string | null }> {
  const { orgId, v2, label, purpose, staffId } = input;
  let labelIngestionId: number | null = null;
  let warning: string | null = null;
  try {
    const recorded = await recordPurchaseLabelIngestion({
      orgId,
      orderId: null,
      order: { order_id: null, account_source: null },
      label,
      labelFormat: LABEL_FORMAT,
      purpose,
      staffId,
      trackingShipmentId: null,
      labelDocumentId: null,
      loadBytes: async () => {
        if (!label.labelUrl) throw new Error('ShipStation returned no label download URL.');
        return (await v2.downloadLabel(label.labelUrl)).buffer;
      },
    });
    labelIngestionId = recorded.labelIngestionId;
    warning = recorded.warning;
  } catch (e) {
    warning = `Label purchased, but adding it to the Labels view failed: ${e instanceof Error ? e.message : String(e)}. Buying again with the same purchase retries without a second charge.`;
    console.warn('[label-buys] label ingestion failed', e);
  }
  if (labelIngestionId != null) {
    await attachLabelPurchaseFacts(orgId, label.purchaseId, { labelIngestionId }).catch((e) =>
      console.warn('[label-buys] purchase ledger update failed', e),
    );
  }
  return { labelIngestionId, warning };
}

/**
 * Remember the bought parcel on the linked product (`product_parcel_dims`,
 * SKU key). The catalog row answers the SKU when it is this org's; a bare SKU
 * is remembered as typed. Returns the rows written.
 */
export async function rememberProductParcel(
  orgId: OrgId,
  input: { product: { skuCatalogId: number | null; sku: string | null }; parcel: Parcel; staffId: number | null },
): Promise<number> {
  const dims = intakeParcelFrom(input.parcel);
  const values = {
    weightOz: positiveOrNull(dims.weightOz),
    lengthIn: positiveOrNull(dims.lengthIn),
    widthIn: positiveOrNull(dims.widthIn),
    heightIn: positiveOrNull(dims.heightIn),
  };
  return withTenantTransaction(orgId, async (client) => {
    let { skuCatalogId, sku } = input.product;
    if (skuCatalogId != null) {
      const row = await client.query<{ sku: string }>(
        `SELECT sku FROM sku_catalog WHERE organization_id = $1 AND id = $2 LIMIT 1`,
        [orgId, skuCatalogId],
      );
      if (row.rows[0]) sku = row.rows[0].sku;
      else skuCatalogId = null;
    } else if (sku) {
      const row = await client.query<{ id: number }>(
        `SELECT id FROM sku_catalog WHERE organization_id = $1 AND sku = $2 LIMIT 1`,
        [orgId, sku],
      );
      skuCatalogId = row.rows[0] ? Number(row.rows[0].id) : null;
    }
    if (!sku) return 0;
    return rememberParcelDims(client, {
      orgId,
      orderId: null,
      sku,
      itemNumber: null,
      skuCatalogId,
      parcel: values,
      staffId: input.staffId,
    });
  });
}

function labelFromOutcome(record: LabelPurchaseRecord, fresh: { label: LabelPurchaseResult; labelUrl: string | null } | null): PurchasedLabel {
  const base = purchasedLabelFromRecord(record);
  if (!fresh) return base;
  return {
    ...base,
    labelId: fresh.label.labelId ?? null,
    trackingNumber: fresh.label.trackingNumber,
    carrierCode: fresh.label.carrierCode ?? null,
    serviceCode: fresh.label.serviceCode ?? null,
    cost: fresh.label.cost ?? null,
    currency: fresh.label.currency ?? null,
    labelUrl: fresh.labelUrl,
  };
}

export async function buyLabelOutright(orgId: OrgId, input: LabelBuyInput, staffId: number | null): Promise<LabelBuyOutcome> {
  const reference = input.reference;
  const customer = toShipAddress(input.shipTo);
  const parcel = toParcel(input.parcel);

  const order = reference ? await findOrderByNumber(orgId, reference) : null;
  const v2 = await getShipStationV2(orgId);
  const buy =
    input.purpose === 'return'
      ? async () => {
          // A return is bought from its shipment (is_return_label), never the rate id.
          const spec = await referenceShipmentSpec(orgId, { purpose: input.purpose, customer, parcel });
          return v2.purchaseLabelFromShipment(spec, input.carrierId, input.serviceCode, {
            labelFormat: LABEL_FORMAT,
            returnLabel: { rmaNumber: reference, outboundLabelId: order ? await latestOutboundLabelId(orgId, order.id) : null },
          });
        }
      : () => v2.purchaseLabelFromRate(input.rateId, { labelFormat: LABEL_FORMAT });

  const outcome = await purchaseLabelOnce(
    {
      orgId,
      orderId: order?.id ?? null,
      clientEventId: input.clientEventId,
      rateId: input.rateId,
      labelFormat: LABEL_FORMAT,
      staffId,
      purpose: input.purpose,
      orderRef: reference,
      shipTo: customer,
      isTest: v2.sandbox,
    },
    buy,
  );
  if (outcome.kind === 'in_flight') return { kind: 'in_flight' };
  if (outcome.kind === 'replay' && outcome.record.status === 'voided') return { kind: 'voided' };

  // ── After the charge: never fails the purchase. ──
  const record = outcome.record;
  const replayed = outcome.kind === 'replay';
  const purpose = record.purpose;
  const label = labelFromOutcome(record, outcome.kind === 'purchased' ? outcome : null);

  // The recorded binding decides (a replay finishes the way the purchase began).
  const boundOrder = record.orderId == null ? null : await loadLabelOrder(orgId, record.orderId).catch(() => null);
  let labelIngestionId: number | null;
  let warning: string | null;
  let shipmentId: number | null = null;
  let isFirstLabel = false;
  if (boundOrder) {
    try {
      const finished = await finishLabelPurchase({
        orgId,
        order: boundOrder,
        orderId: boundOrder.id,
        orderRef: boundOrder.order_id || `order-${boundOrder.id}`,
        clientEventId: input.clientEventId,
        labelFormat: LABEL_FORMAT,
        staffId,
        v2,
        label,
        knownShipmentId: replayed ? record.shipmentId : null,
        knownDocumentId: replayed ? record.labelDocumentId : null,
        purpose,
      });
      labelIngestionId = finished.labelIngestionId;
      warning = finished.warning;
      shipmentId = finished.shipmentId;
      isFirstLabel = finished.isFirstLabel;
    } catch (e) {
      labelIngestionId = null;
      warning = `Label purchased, but pairing it with order ${boundOrder.order_id ?? boundOrder.id} failed: ${e instanceof Error ? e.message : String(e)}. Buying again with the same purchase retries without a second charge.`;
      console.warn('[label-buys] order finish failed', e);
    }
  } else {
    ({ labelIngestionId, warning } = await finishOrderless({ orgId, v2, label, purpose, staffId }));
  }

  if (input.rememberParcel && input.product) {
    try {
      await rememberProductParcel(orgId, { product: input.product, parcel, staffId });
    } catch (e) {
      const note = 'The parcel was not remembered for the linked product.';
      warning = warning ? `${warning} ${note}` : note;
      console.warn('[label-buys] remember parcel failed', e);
    }
  }

  return {
    kind: 'bought',
    orderId: boundOrder?.id ?? null,
    purpose,
    label,
    shipmentId,
    isFirstLabel,
    result: {
      purchaseId: record.id,
      replayed,
      tracking: label.trackingNumber || null,
      carrier: label.carrierCode,
      service: label.serviceCode,
      cost: label.cost,
      currency: label.currency,
      labelIngestionId,
      warning,
    },
  };
}

// ── Products ───────────────────────────────────────────────────────────────

type ProductSqlRow = {
  id: number | string;
  sku: string | null;
  catalog_product_title: string | null;
  sku_parcel_weight_oz: string | null;
  sku_parcel_length_in: string | null;
  sku_parcel_width_in: string | null;
  sku_parcel_height_in: string | null;
  item_parcel_weight_oz: string | null;
  item_parcel_length_in: string | null;
  item_parcel_width_in: string | null;
  item_parcel_height_in: string | null;
};

/**
 * Catalog products by SKU, title or item number (`sku_platform_ids.platform_item_id`),
 * each with its remembered parcel: the SKU record first, then an item-number
 * record (the searched item number first, then the most recently measured).
 */
export async function searchLabelBuyProducts(orgId: OrgId, q: string): Promise<LabelBuyProduct[]> {
  // `%`, `_` and `\` typed by the operator match themselves.
  const like = q.replace(/[\\%_]/g, '\\$&');
  const res = await tenantQuery<ProductSqlRow>(
    orgId,
    `WITH needle AS (SELECT ${itemKeySql('$2::text')} AS item_key)
     SELECT sc.id, sc.sku, sc.product_title AS catalog_product_title,
            ppd_sku.weight_oz  AS sku_parcel_weight_oz,
            ppd_sku.length_in  AS sku_parcel_length_in,
            ppd_sku.width_in   AS sku_parcel_width_in,
            ppd_sku.height_in  AS sku_parcel_height_in,
            ppd_item.weight_oz AS item_parcel_weight_oz,
            ppd_item.length_in AS item_parcel_length_in,
            ppd_item.width_in  AS item_parcel_width_in,
            ppd_item.height_in AS item_parcel_height_in
       FROM sku_catalog sc
       CROSS JOIN needle
       LEFT JOIN product_parcel_dims ppd_sku
              ON ppd_sku.organization_id = sc.organization_id
             AND ppd_sku.key_kind = 'sku'
             AND ppd_sku.key_value = ${skuKeySql('sc.sku')}
       LEFT JOIN LATERAL (
         SELECT p.weight_oz, p.length_in, p.width_in, p.height_in
           FROM product_parcel_dims p
          WHERE p.organization_id = sc.organization_id
            AND p.key_kind = 'item_number'
            AND (p.sku_catalog_id = sc.id
                 OR p.key_value IN (SELECT ${itemKeySql('spi.platform_item_id')}
                                      FROM sku_platform_ids spi
                                     WHERE spi.organization_id = sc.organization_id AND spi.sku_catalog_id = sc.id))
          ORDER BY (p.key_value = needle.item_key) DESC NULLS LAST, p.updated_at DESC
          LIMIT 1
       ) ppd_item ON true
      WHERE sc.organization_id = $1
        AND (sc.sku ILIKE $3
             OR sc.product_title ILIKE $3
             OR EXISTS (SELECT 1 FROM sku_platform_ids spi
                         WHERE spi.organization_id = sc.organization_id AND spi.sku_catalog_id = sc.id
                           AND (spi.platform_item_id ILIKE $3
                                OR (needle.item_key IS NOT NULL
                                    AND ${itemKeySql('spi.platform_item_id')} = needle.item_key))))
      ORDER BY (UPPER(sc.sku) = UPPER($2)) DESC, (sc.sku ILIKE $4) DESC, sc.is_active DESC, sc.sku ASC
      LIMIT ${MAX_LABEL_BUY_PRODUCTS}`,
    [orgId, q, `%${like}%`, `${like}%`],
  );
  return res.rows.map((row) =>
    toLabelBuyProduct({
      ...row,
      title: resolveSkuIdentityTitle({
        catalog_product_title: row.catalog_product_title,
        sku: row.sku,
      }),
    }),
  );
}

// ── Errors ─────────────────────────────────────────────────────────────────

/** One ShipStation-aware v1 error face for the label-buy routes. */
export function labelBuyErrorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof ShipStationNotConnectedError) return v1Error(400, 'SHIPSTATION_NOT_CONNECTED', error.message);
  if (error instanceof ShipFromNotConfiguredError) return v1Error(400, 'SHIP_FROM_NOT_CONFIGURED', error.message);
  if (error instanceof ShipStationTestModeError) return v1Error(409, 'LABEL_TEST_MODE_BLOCKED', error.message);
  if (error instanceof ShipStationApiError) {
    return error.isNotConnected
      ? v1Error(400, 'SHIPSTATION_NOT_CONNECTED', error.message)
      : v1Error(502, 'SHIPSTATION_ERROR', error.message);
  }
  console.error(`[label-buys] ${where}`, error);
  return v1Error(500, 'INTERNAL', 'The label request failed.');
}
