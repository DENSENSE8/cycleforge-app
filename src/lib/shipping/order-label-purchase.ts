/**
 * One order's label purchase, after the charge — shared by the desk's buy route
 * (`/api/shipping/order-labels/purchase`) and the chat's `buy_label`: register
 * the tracking on the order, snapshot the as-shipped ship-to, store the label
 * PDF + packing slip in documents, put the label in the Labels & docs print
 * ledger (label-purchase-ingestion.ts), and attach all of it to the purchase
 * ledger row. Plus the reverse: {@link voidOrderLabel}.
 */

import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import {
  deleteOutboundDocument,
  OutboundDocumentNotFoundError,
  storeOutboundDocumentFromBytes,
  OutboundDocumentValidationError,
} from '@/lib/documents/outbound-documents';
import { generatePackingSlipPdf } from '@/lib/documents/generate-packing-slip-pdf';
import { getShipStationV1 } from '@/lib/shipping/shipstation/config';
import type { LabelPurchaseOptions, ShipStationV2Client } from '@/lib/shipping/shipstation/client';
import {
  attachLabelPurchaseFacts,
  markLabelPurchaseVoided,
  type LabelPurchaseRecord,
} from '@/lib/shipping/label-purchase-ledger';
import { recordPurchaseLabelIngestion, removeVoidedLabelIngestion } from '@/lib/shipping/label-purchase-ingestion';
import {
  isShipStationOrder,
  resolveOrderShipTo,
  snapshotShipToOnShipment,
} from '@/lib/shipping/shipstation/order-ship-to';
import type { LabelPurpose } from '@/lib/shipping/label-purpose';

// `type` (not `interface`) so it satisfies pg/tenantQuery's `QueryResultRow`
// constraint — interfaces lack the implicit index signature.
export type LabelOrderRow = {
  id: number;
  order_id: string | null;
  account_source: string | null;
  customer_id: number | null;
  product_title: string | null;
  sku: string | null;
  quantity: string | null;
};

export async function loadLabelOrder(orgId: OrgId, orderId: number): Promise<LabelOrderRow | null> {
  const res = await tenantQuery<LabelOrderRow>(
    orgId,
    `SELECT id, order_id, account_source, customer_id, product_title, sku, quantity
       FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [orderId, orgId],
  );
  return res.rows[0] ?? null;
}

export async function resolveCustomerEmail(orgId: OrgId, order: LabelOrderRow): Promise<string | null> {
  if (order.customer_id) {
    const res = await tenantQuery<{ email: string | null }>(
      orgId,
      `SELECT NULLIF(email, '') AS email FROM customers WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [order.customer_id, orgId],
    );
    if (res.rows[0]?.email) return res.rows[0].email;
  }
  if (order.order_id && (await isShipStationOrder(orgId, order).catch(() => false))) {
    const v1 = await getShipStationV1(orgId);
    const ssOrder = v1 ? await v1.getOrderByNumber(order.order_id) : null;
    return ssOrder?.customerEmail ?? null;
  }
  return null;
}

/** What the post-charge steps need — from a fresh label or a recorded purchase. */
export interface PurchasedLabel {
  purchaseId: number;
  labelId: string | null;
  trackingNumber: string;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  currency: string | null;
  labelUrl: string | null;
}

export function purchasedLabelFromRecord(record: LabelPurchaseRecord): PurchasedLabel {
  return {
    purchaseId: record.id,
    labelId: record.labelId,
    trackingNumber: record.trackingNumber ?? '',
    carrierCode: record.carrierCode,
    serviceCode: record.serviceCode,
    cost: record.cost,
    currency: record.currency,
    labelUrl: record.labelUrl,
  };
}

export function buildShipEmail(to: string, orderRef: string, label: PurchasedLabel) {
  const carrier = label.carrierCode ? label.carrierCode.toUpperCase() : 'the carrier';
  const text = [
    `Good news — your order ${orderRef} is on its way.`,
    '',
    `Carrier: ${carrier}`,
    `Tracking number: ${label.trackingNumber}`,
    '',
    'Thank you for your order.',
  ].join('\n');
  const html = `<p>Good news — your order <strong>${orderRef}</strong> is on its way.</p>
<p><strong>Carrier:</strong> ${carrier}<br/><strong>Tracking number:</strong> ${label.trackingNumber}</p>
<p>Thank you for your order.</p>`;
  return { to, subject: `Your order ${orderRef} has shipped`, text, html };
}

/** Everything after the charge. */
export async function finishLabelPurchase(input: {
  orgId: OrgId;
  order: LabelOrderRow;
  orderId: number;
  orderRef: string;
  clientEventId: string;
  labelFormat: NonNullable<LabelPurchaseOptions['labelFormat']>;
  staffId: number | null;
  v2: ShipStationV2Client;
  label: PurchasedLabel;
  knownShipmentId: number | null;
  knownDocumentId: number | null;
  purpose: LabelPurpose;
}): Promise<{
  shipmentId: number | null;
  labelDocumentId: number | null;
  /** The label's row in the Labels & docs print ledger (`label_ingestions.id`). */
  labelIngestionId: number | null;
  isFirstLabel: boolean;
  warning: string | null;
}> {
  const { orgId, order, orderId, orderRef, clientEventId, labelFormat, staffId, v2, label, purpose } = input;

  // 2. Register the tracking: the order's primary (outbound) or one more
  // tracking on the order (replacement). A return's tracking is not the order's.
  let primaryShipmentId: number | null = input.knownShipmentId;
  if (primaryShipmentId == null && label.trackingNumber && purpose === 'replacement') {
    try {
      const trk = await applyOrderTrackingOps({
        orderIds: [orderId],
        organizationId: orgId,
        creates: [{ trackingNumber: label.trackingNumber }],
      });
      primaryShipmentId = trk.createdShipmentIds[0] ?? null;
    } catch (e) {
      console.error('[buy-label] replacement tracking register failed', e);
    }
  }
  if (primaryShipmentId == null && label.trackingNumber && purpose === 'outbound') {
    try {
      const trk = await applyOrderTrackingOps({
        orderIds: [orderId],
        organizationId: orgId,
        primaryTrackingNumber: label.trackingNumber,
        // The label names its carrier — store that, not a regex guess.
        primaryCarrier: shipStationCarrierToStored(label.carrierCode),
      });
      primaryShipmentId = trk.primaryShipmentId;
    } catch (e) {
      console.error('[buy-label] tracking register failed', e);
    }
    // The primaryTrackingNumber path returns primaryShipmentId only when it
    // CREATED a link row; upsertOrderTracking instead writes orders.shipment_id
    // directly — read it back so the snapshot below targets the real STN row.
    if (primaryShipmentId == null) {
      try {
        const refreshed = await tenantQuery<{ shipment_id: number | null }>(
          orgId,
          `SELECT shipment_id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [orderId, orgId],
        );
        primaryShipmentId = refreshed.rows[0]?.shipment_id ?? null;
      } catch (e) {
        console.warn('[buy-label] shipment read-back failed', e);
      }
    }

    // 2b. Snapshot the AS-SHIPPED ship-to onto the STN row.
    try {
      const { shipTo } = await resolveOrderShipTo(orgId, order);
      if (shipTo && primaryShipmentId != null) {
        await snapshotShipToOnShipment(orgId, primaryShipmentId, {
          shipTo,
          customerId: order.customer_id,
          orderRef,
          labelId: label.labelId,
          service: label.serviceCode,
          cost: label.cost,
          currency: label.currency,
          purchasedBy: staffId,
        });
      }
    } catch (e) {
      console.warn('[buy-label] ship_to snapshot failed', e);
    }
  }

  // 3a. Store the label bytes (best-effort; GCS-gated). The v2 client carries
  // the API key — the generic `href` download answers 401 without it.
  let labelDocumentId: number | null = input.knownDocumentId;
  let isFirstLabel = false;
  let warning: string | null = null;
  // The downloaded label bytes, reused for the Labels-view ingestion (3c).
  let labelBytes: Buffer | null = null;
  if (labelDocumentId == null && purpose !== 'return') {
    try {
      if (!label.labelUrl) throw new Error('ShipStation returned no label download URL.');
      const { buffer, contentType } = await v2.downloadLabel(label.labelUrl);
      labelBytes = buffer;
      const stored = await storeOutboundDocumentFromBytes(orgId, {
        orderId,
        orderRef,
        documentType: 'shipping_label',
        platform: 'shipstation',
        source: 'shipstation_api',
        buffer,
        contentType,
        tracking: label.trackingNumber,
        carrier: label.carrierCode,
        uploadedBy: staffId,
        sourceHash: clientEventId,
        filename: `label-${label.trackingNumber}.${labelFormat}`,
      });
      labelDocumentId = stored.document.id;
      isFirstLabel = stored.isFirstLabel;
    } catch (e) {
      warning =
        e instanceof OutboundDocumentValidationError
          ? 'Label purchased, but document storage is not configured — open/print it from the label URL.'
          : `Label purchased, but storing the label document failed: ${e instanceof Error ? e.message : String(e)}. Buying again under this purchase retries the download without a second charge.`;
      console.warn('[buy-label] label document store failed', e);
    }

    // 3b. Generate + store the packing slip (best-effort; GCS-gated).
    try {
      const slip = generatePackingSlipPdf({
        orderRef,
        platform: 'shipstation',
        lines: [{ sku: order.sku, title: order.product_title, quantity: order.quantity }],
        tracking: label.trackingNumber,
      });
      await storeOutboundDocumentFromBytes(orgId, {
        orderId,
        orderRef,
        documentType: 'packing_slip',
        platform: 'shipstation',
        source: 'generated',
        buffer: slip,
        contentType: 'application/pdf',
        tracking: label.trackingNumber,
        carrier: label.carrierCode,
        uploadedBy: staffId,
        sourceHash: `${clientEventId}:slip`,
        filename: `packing-slip-${orderRef}.pdf`,
      });
    } catch (e) {
      console.warn('[buy-label] packing slip store failed', e);
    }
  }

  // 3c. The Labels & docs print ledger: one ingestion per bought label, paired
  // to this order (best-effort; never fails, repeats or re-buys the purchase).
  let labelIngestionId: number | null = null;
  try {
    const recorded = await recordPurchaseLabelIngestion({
      orgId,
      orderId,
      order,
      label,
      labelFormat,
      purpose,
      staffId,
      trackingShipmentId: primaryShipmentId,
      labelDocumentId,
      loadBytes: async () => {
        if (labelBytes) return labelBytes;
        if (!label.labelUrl) throw new Error('ShipStation returned no label download URL.');
        return (await v2.downloadLabel(label.labelUrl)).buffer;
      },
    });
    labelIngestionId = recorded.labelIngestionId;
    if (recorded.warning) warning = warning ? `${warning} ${recorded.warning}` : recorded.warning;
  } catch (e) {
    const note = `Label purchased, but adding it to the Labels view failed: ${e instanceof Error ? e.message : String(e)}. Buying again under this purchase retries without a second charge.`;
    warning = warning ? `${warning} ${note}` : note;
    console.warn('[buy-label] label ingestion failed', e);
  }

  try {
    await attachLabelPurchaseFacts(orgId, label.purchaseId, { labelDocumentId, shipmentId: primaryShipmentId, labelIngestionId });
  } catch (e) {
    console.warn('[buy-label] purchase ledger update failed', e);
  }

  return { shipmentId: primaryShipmentId, labelDocumentId, labelIngestionId, isFirstLabel, warning };
}

/**
 * Void one bought label: at the carrier first (the source of truth on whether a
 * refund is possible), then stop the ledger replaying it, take it out of the
 * Labels view, and reverse the local tracking link + label document
 * (best-effort). The desk's void route and the chat's `void_label` share it.
 */
export async function voidOrderLabel(
  orgId: OrgId,
  v2: ShipStationV2Client,
  input: { orderId: number; labelId: string; shipmentId: number | null; documentId: number | null },
): Promise<{ approved: boolean; message: string | null; removedLabelIngestionIds: number[] }> {
  const result = await v2.voidLabel(input.labelId);
  if (!result.approved) return { approved: false, message: result.message ?? null, removedLabelIngestionIds: [] };

  // The purchase ledger stops replaying this label; the next buy mints a fresh key.
  try {
    await markLabelPurchaseVoided(orgId, input.labelId);
  } catch (e) {
    console.warn('[void-label] purchase ledger stamp failed', e);
  }
  // Out of the Labels view — before the document delete, which its ingestion's
  // document reference would otherwise block.
  let removedLabelIngestionIds: number[] = [];
  try {
    removedLabelIngestionIds = await removeVoidedLabelIngestion(orgId, input.labelId);
  } catch (e) {
    console.warn('[void-label] remove label ingestion failed', e);
  }
  if (input.shipmentId != null && input.shipmentId > 0) {
    try {
      await applyOrderTrackingOps({ orderIds: [input.orderId], organizationId: orgId, deletes: [{ shipmentId: input.shipmentId }] });
    } catch (e) {
      console.warn('[void-label] unlink shipment failed', e);
    }
  }
  if (input.documentId != null && input.documentId > 0) {
    try {
      await deleteOutboundDocument(orgId, input.documentId, { expectedDocumentType: 'shipping_label' });
    } catch (e) {
      if (!(e instanceof OutboundDocumentNotFoundError)) console.warn('[void-label] delete label document failed', e);
    }
  }
  return { approved: true, message: result.message ?? null, removedLabelIngestionIds };
}
