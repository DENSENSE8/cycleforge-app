import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { publishOrderChanged, publishShipmentChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { sendEmailBestEffort } from '@/lib/email/send';
import { getShipStationV2, ShipStationNotConnectedError } from '@/lib/shipping/shipstation/config';
import { ShipStationApiError, type LabelPurchaseOptions } from '@/lib/shipping/shipstation/client';
import { purchaseLabelOnce } from '@/lib/shipping/label-purchase-ledger';
import {
  buildShipEmail,
  finishLabelPurchase,
  loadLabelOrder,
  purchasedLabelFromRecord,
  resolveCustomerEmail,
  type PurchasedLabel,
} from '@/lib/shipping/order-label-purchase';
import { labelPurchaseBody } from '@/lib/shipping/label-purchase-response';
import { createOrderNote } from '@/lib/orders/order-notes';
import { isLabelPurpose, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { labelTrailNote } from '@/lib/shipping/order-label-links';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { buildOrderShipmentSpec } from '@/lib/shipping/shipstation/order-shipment-spec';
import { OrderRateDimensionsSchema } from '@/lib/shipping/shipstation/order-parcel';
import { REPLACEMENT_REASONS, type ReplacementReason } from '@/lib/shipping/replacement-rate-shop';

export const dynamic = 'force-dynamic';

/** POST /api/shipping/order-labels/purchase */

/** Why a replacement was bought — only meaningful with `purpose: 'replacement'`. */
const ReplacementDetailsSchema = z.object({
  replacementReason: z
    .custom<ReplacementReason>((v) => REPLACEMENT_REASONS.some((r) => r.id === v))
    .nullish(),
  replacementNote: z.string().trim().max(500).nullish(),
});

/** The buy's order-notes trail line, with the replacement reason + note when given. */
function buyTrailNote(
  purpose: LabelPurpose,
  label: PurchasedLabel,
  reason: ReplacementReason | null,
  note: string | null,
): string {
  const reasonLabel = reason ? REPLACEMENT_REASONS.find((r) => r.id === reason)?.label ?? null : null;
  const why = [reasonLabel, note].filter(Boolean).join(' — ');
  return `${labelTrailNote('Bought', purpose, label)}${why ? ` · ${why}` : ''}`;
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
    const replacement = ReplacementDetailsSchema.safeParse({
      replacementReason: body?.replacementReason,
      replacementNote: body?.replacementNote,
    });
    if (!replacement.success) {
      throw ApiError.badRequest(
        'replacementReason must be lost, damaged, wrong_item or other; replacementNote at most 500 characters',
      );
    }
    const replacementReason = replacement.data.replacementReason ?? null;
    const replacementNote = replacement.data.replacementNote || null;
    if ((replacementReason || replacementNote) && purpose !== 'replacement') {
      throw ApiError.badRequest('replacementReason / replacementNote need purpose: replacement');
    }
    // A return is bought from its shipment (v2 POST /labels + is_return_label),
    // never from the rate id — ShipStation ignores the flag there.
    const carrierId = String(body?.carrierId || '').trim();
    const serviceCode = String(body?.serviceCode || '').trim();
    if (purpose === 'return' && (!carrierId || !serviceCode)) {
      throw ApiError.badRequest('A return label needs the chosen rate’s carrierId and serviceCode');
    }

    const order = await loadLabelOrder(orgId, orderId);
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
        labelIngestionId: null,
      });
    }

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
      {
        orgId,
        orderId,
        clientEventId,
        rateId,
        labelFormat,
        staffId: ctx.staffId ?? null,
        purpose,
        isTest: v2.sandbox,
        replacementReason,
        replacementNote,
      },
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
      const label = purchasedLabelFromRecord(outcome.record);
      const finished = await finishLabelPurchase({ orgId, order, orderId, orderRef, clientEventId, labelFormat, staffId: ctx.staffId ?? null, v2, label, knownShipmentId: outcome.record.shipmentId, knownDocumentId: outcome.record.labelDocumentId, purpose: outcome.record.purpose });
      return NextResponse.json(labelPurchaseBody({ label, finished, purpose: outcome.record.purpose, idempotent: true }));
    }

    const label: PurchasedLabel = {
      ...purchasedLabelFromRecord(outcome.record),
      labelId: outcome.label.labelId ?? null,
      trackingNumber: outcome.label.trackingNumber,
      carrierCode: outcome.label.carrierCode ?? null,
      serviceCode: outcome.label.serviceCode ?? null,
      cost: outcome.label.cost ?? null,
      currency: outcome.label.currency ?? null,
      labelUrl: outcome.labelUrl,
    };

    // 2–3. Tracking, ship-to snapshot, label document, packing slip, Labels view.
    const finished = await finishLabelPurchase({
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
    const { shipmentId: primaryShipmentId, labelDocumentId, labelIngestionId, isFirstLabel } = finished;

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
      extra: { shipmentId: primaryShipmentId, labelDocumentId, labelIngestionId, clientEventId, purchaseId: label.purchaseId },
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
        noteText: buyTrailNote(purpose, label, replacementReason, replacementNote),
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
            carrier: shipStationCarrierToStored(label.carrierCode),
            source: 'outbound.buy-label',
          });
        }
      } catch (e) {
        console.warn('[buy-label] realtime/cache failed', e);
      }
      // The buyer gets tracking for a parcel coming to them — never for a return,
      // never for a sandbox test label.
      if (notifyCustomer && purpose !== 'return' && !v2.sandbox) {
        try {
          const email = await resolveCustomerEmail(orgId, order);
          if (email) await sendEmailBestEffort(buildShipEmail(email, orderRef, label));
        } catch (e) {
          console.warn('[buy-label] customer notification failed', e);
        }
      }
    });

    return NextResponse.json(labelPurchaseBody({ label, finished, purpose, idempotent: false }));
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
