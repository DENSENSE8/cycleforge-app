import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import {
  storeOutboundDocumentFromBytes,
  OutboundDocumentValidationError,
} from '@/lib/documents/outbound-documents';
import { generatePackingSlipPdf } from '@/lib/documents/generate-packing-slip-pdf';
import { publishOrderChanged, publishShipmentChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { sendEmailBestEffort } from '@/lib/email/send';
import {
  getShipStationV1,
  getShipStationV2,
  ShipStationNotConnectedError,
} from '@/lib/shipping/shipstation/config';
import { ShipStationApiError, type LabelPurchaseOptions, type ShipStationV2Client } from '@/lib/shipping/shipstation/client';
import {
  attachLabelPurchaseFacts,
  purchaseLabelOnce,
  type LabelPurchaseRecord,
} from '@/lib/shipping/label-purchase-ledger';
import {
  isShipStationOrder,
  resolveOrderShipTo,
  snapshotShipToOnShipment,
} from '@/lib/shipping/shipstation/order-ship-to';
import { buyerNoteHoldBody, readBuyerNoteHold } from '@/lib/orders/buyer-note-interlock';
import { createOrderNote } from '@/lib/orders/order-notes';
import { isLabelPurpose, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { labelTrailNote } from '@/lib/shipping/order-label-links';
import { buildOrderShipmentSpec } from '@/lib/shipping/shipstation/order-shipment-spec';
import { OrderRateDimensionsSchema } from '@/lib/shipping/shipstation/order-parcel';

export const dynamic = 'force-dynamic';

/** POST /api/shipping/order-labels/purchase */

// `type` (not `interface`) so it satisfies pg/tenantQuery's `QueryResultRow`
// constraint — interfaces lack the implicit index signature.
type OrderRow = {
  id: number;
  order_id: string | null;
  account_source: string | null;
  customer_id: number | null;
  product_title: string | null;
  sku: string | null;
  quantity: string | null;
};

async function loadOrder(orgId: OrgId, orderId: number): Promise<OrderRow | null> {
  const res = await tenantQuery<OrderRow>(
    orgId,
    `SELECT id, order_id, account_source, customer_id, product_title, sku, quantity
       FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [orderId, orgId],
  );
  return res.rows[0] ?? null;
}

/** A prior successful purchase under this clientEventId (label doc sourceHash). */
async function findLabelBySourceHash(
  orgId: OrgId,
  sourceHash: string,
): Promise<{ id: number; tracking: string | null; carrier: string | null } | null> {
  const res = await tenantQuery<{ id: number; tracking: string | null; carrier: string | null }>(
    orgId,
    `SELECT id, document_data->>'tracking' AS tracking, document_data->>'carrier' AS carrier
       FROM documents
      WHERE organization_id = $1 AND document_type = 'shipping_label'
        AND document_data->>'sourceHash' = $2
      LIMIT 1`,
    [orgId, sourceHash],
  );
  return res.rows[0] ?? null;
}

async function resolveCustomerEmail(orgId: OrgId, order: OrderRow): Promise<string | null> {
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
interface PurchasedLabel {
  purchaseId: number;
  labelId: string | null;
  trackingNumber: string;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  currency: string | null;
  labelUrl: string | null;
}

function fromRecord(record: LabelPurchaseRecord): PurchasedLabel {
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

function buildShipEmail(to: string, orderRef: string, label: PurchasedLabel) {
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
async function finishPurchase(input: {
  orgId: OrgId;
  order: OrderRow;
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
}): Promise<{ shipmentId: number | null; labelDocumentId: number | null; isFirstLabel: boolean; warning: string | null }> {
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
  if (labelDocumentId == null && purpose !== 'return') {
    try {
      if (!label.labelUrl) throw new Error('ShipStation returned no label download URL.');
      const { buffer, contentType } = await v2.downloadLabel(label.labelUrl);
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

  try {
    await attachLabelPurchaseFacts(orgId, label.purchaseId, { labelDocumentId, shipmentId: primaryShipmentId });
  } catch (e) {
    console.warn('[buy-label] purchase ledger update failed', e);
  }

  return { shipmentId: primaryShipmentId, labelDocumentId, isFirstLabel, warning };
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  try {
    const body = await req.json().catch(() => null);
    const orderId = Number(body?.orderId);
    const rateId = String(body?.rateId || '').trim();
    const clientEventId = String(body?.clientEventId || '').trim();
    const labelFormat: NonNullable<LabelPurchaseOptions['labelFormat']> = ['pdf', 'png', 'zpl'].includes(body?.labelFormat)
      ? body.labelFormat
      : 'pdf';
    const notifyCustomer = body?.notifyCustomer !== false; // default on
    const purpose: LabelPurpose = body?.purpose == null ? 'outbound' : body.purpose;

    if (!Number.isFinite(orderId) || orderId <= 0) throw ApiError.badRequest('Valid orderId is required');
    if (!rateId) throw ApiError.badRequest('rateId is required');
    if (!clientEventId) throw ApiError.badRequest('clientEventId is required (idempotency key)');
    if (!isLabelPurpose(purpose)) throw ApiError.badRequest('purpose must be outbound, return or replacement');
    // A return is bought from its shipment (v2 POST /labels + is_return_label),
    // never from the rate id — ShipStation ignores the flag there.
    const carrierId = String(body?.carrierId || '').trim();
    const serviceCode = String(body?.serviceCode || '').trim();
    if (purpose === 'return' && (!carrierId || !serviceCode)) {
      throw ApiError.badRequest('A return label needs the chosen rate’s carrierId and serviceCode');
    }

    const order = await loadOrder(orgId, orderId);
    if (!order) throw ApiError.notFound('order', orderId);
    const orderRef = order.order_id || `order-${orderId}`;

    // Keys minted before the purchase ledger existed: the label document was
    // the only record — keep honouring it.
    const prior = await findLabelBySourceHash(orgId, clientEventId);
    if (prior) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        tracking: prior.tracking,
        carrier: prior.carrier,
        labelDocumentId: prior.id,
      });
    }

    // Buyer-note interlock — before the IRREVERSIBLE purchase: the order's
    // current buyer note must be acknowledged (src/lib/orders/buyer-note-interlock.ts).
    const buyerNoteHold = await readBuyerNoteHold(
      { query: (text, params) => tenantQuery(orgId, text, params) },
      orgId,
      orderId,
    );
    if (buyerNoteHold) return NextResponse.json(buyerNoteHoldBody(buyerNoteHold), { status: 409 });

    // 1. Claim the key, buy the label — IRREVERSIBLE — and record it before
    //    anything else can fail.
    const v2 = await getShipStationV2(orgId);
    const buy =
      purpose === 'return'
        ? async () => {
            // The same buyer → warehouse shipment the return was rated on.
            const { spec } = await buildOrderShipmentSpec(orgId, {
              orderId,
              weightOzOverride: typeof body?.weightOz === 'number' && body.weightOz > 0 ? body.weightOz : null,
              dimensions: OrderRateDimensionsSchema.nullish().catch(null).parse(body?.dimensions) ?? null,
              purpose,
            });
            const outbound = await tenantQuery<{ label_id: string }>(
              orgId,
              `SELECT label_id FROM shipping_label_purchases
                WHERE organization_id = $1 AND order_id = $2 AND purpose = 'outbound'
                  AND status = 'purchased' AND label_id IS NOT NULL
                ORDER BY created_at DESC LIMIT 1`,
              [orgId, orderId],
            );
            return v2.purchaseLabelFromShipment(spec, carrierId, serviceCode, {
              labelFormat,
              returnLabel: { rmaNumber: orderRef, outboundLabelId: outbound.rows[0]?.label_id ?? null },
            });
          }
        : () => v2.purchaseLabelFromRate(rateId, { labelFormat });
    const outcome = await purchaseLabelOnce(
      { orgId, orderId, clientEventId, rateId, labelFormat, staffId: ctx.staffId ?? null, purpose },
      buy,
    );

    if (outcome.kind === 'in_flight') {
      return NextResponse.json(
        {
          ok: false,
          code: 'LABEL_PURCHASE_IN_FLIGHT',
          error:
            'A purchase for this label is already in progress or did not finish. Check ShipStation for a new label on this order before buying again.',
        },
        { status: 409 },
      );
    }
    if (outcome.kind === 'replay') {
      if (outcome.record.status === 'voided') {
        return NextResponse.json(
          { ok: false, code: 'LABEL_PURCHASE_VOIDED', error: 'That label was voided. Get fresh rates to buy a new one.' },
          { status: 409 },
        );
      }
      // Bought on an earlier attempt — finish what that attempt may not have
      // (every step below dedupes), but never charge again.
      const label = fromRecord(outcome.record);
      const finished = await finishPurchase({ orgId, order, orderId, orderRef, clientEventId, labelFormat, staffId: ctx.staffId ?? null, v2, label, knownShipmentId: outcome.record.shipmentId, knownDocumentId: outcome.record.labelDocumentId, purpose: outcome.record.purpose });
      return NextResponse.json({
        ok: true,
        idempotent: true,
        tracking: label.trackingNumber,
        carrier: label.carrierCode,
        service: label.serviceCode,
        cost: label.cost,
        currency: label.currency,
        labelId: label.labelId,
        labelUrl: label.labelUrl,
        shipmentId: finished.shipmentId,
        labelDocumentId: finished.labelDocumentId,
        warning: finished.warning,
      });
    }

    const label: PurchasedLabel = {
      ...fromRecord(outcome.record),
      labelId: outcome.label.labelId ?? null,
      trackingNumber: outcome.label.trackingNumber,
      carrierCode: outcome.label.carrierCode ?? null,
      serviceCode: outcome.label.serviceCode ?? null,
      cost: outcome.label.cost ?? null,
      currency: outcome.label.currency ?? null,
      labelUrl: outcome.labelUrl,
    };

    // 2–3. Tracking, ship-to snapshot, label document, packing slip.
    const { shipmentId: primaryShipmentId, labelDocumentId, isFirstLabel, warning } = await finishPurchase({
      orgId,
      order,
      orderId,
      orderRef,
      clientEventId,
      labelFormat,
      staffId: ctx.staffId ?? null,
      v2,
      label,
      knownShipmentId: null,
      knownDocumentId: null,
      purpose,
    });
    const labelUrl = label.labelUrl;

    // 4. Audit trail (recordAudit never throws).
    await recordAudit(pool, ctx, req, {
      source: 'api.outbound.labels.purchase',
      action: AUDIT_ACTION.LABEL_PURCHASED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      after: {
        tracking: label.trackingNumber,
        carrier: label.carrierCode,
        service: label.serviceCode,
        cost: label.cost,
        currency: label.currency,
        labelId: label.labelId,
        rateId,
        purpose,
        creationType: 'bought_in_app',
      },
      extra: { shipmentId: primaryShipmentId, labelDocumentId, clientEventId, purchaseId: label.purchaseId },
    });
    if (isFirstLabel) {
      await recordAudit(pool, ctx, req, {
        source: 'api.outbound.labels.purchase',
        action: AUDIT_ACTION.LABEL_PRINTED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: orderId,
        after: { tracking: label.trackingNumber, carrier: label.carrierCode },
      });
    }
    if (purpose !== 'return') {
      await recordAudit(pool, ctx, req, {
        source: 'api.outbound.labels.purchase',
        action: AUDIT_ACTION.TRACKING_ADDED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: orderId,
        after: { tracking: label.trackingNumber, purpose },
      });
    }
    // A return / replacement is a second story on the same order — write it
    // into the order's notes trail so the queue shows it next to the order.
    if (purpose !== 'outbound') {
      await createOrderNote({
        orderId,
        organizationId: orgId,
        noteText: labelTrailNote('Bought', purpose, label),
        staffId: ctx.staffId ?? null,
      }).catch((e) => console.warn('[buy-label] order note failed', e));
    }

    // 5. Fire-and-forget: realtime + cache + customer notification.
    after(async () => {
      try {
        await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
        await publishOrderChanged({ organizationId: orgId, orderIds: [orderId], source: 'outbound.buy-label' });
        if (primaryShipmentId) {
          await publishShipmentChanged({
            organizationId: orgId,
            shipmentId: primaryShipmentId,
            trackingNumber: label.trackingNumber,
            source: 'outbound.buy-label',
          });
        }
      } catch (e) {
        console.warn('[buy-label] realtime/cache failed', e);
      }
      // The buyer gets tracking for a parcel coming to them — never for a return.
      if (notifyCustomer && purpose !== 'return') {
        try {
          const email = await resolveCustomerEmail(orgId, order);
          if (email) await sendEmailBestEffort(buildShipEmail(email, orderRef, label));
        } catch (e) {
          console.warn('[buy-label] customer notification failed', e);
        }
      }
    });

    return NextResponse.json({
      ok: true,
      tracking: label.trackingNumber,
      carrier: label.carrierCode,
      service: label.serviceCode,
      cost: label.cost,
      currency: label.currency,
      labelId: label.labelId,
      labelUrl,
      shipmentId: primaryShipmentId,
      labelDocumentId,
      warning,
      purpose,
      purchaseId: label.purchaseId,
    });
  } catch (error) {
    if (error instanceof ShipStationNotConnectedError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'SHIPSTATION_NOT_CONNECTED' },
        { status: 400 },
      );
    }
    if (error instanceof ShipStationApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.isNotConnected ? 400 : 502 },
      );
    }
    return errorResponse(error, 'POST /api/shipping/order-labels/purchase');
  }
}, { permission: 'shipping.buy_label' });
