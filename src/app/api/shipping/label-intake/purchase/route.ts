import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import { LabelIntakePurchaseBody } from '@/lib/schemas/label-intake';
import { toParcel, toShipAddress } from '@/lib/shipping/shipstation/rate-request';
import { purchaseReferenceLabel } from '@/lib/shipping/label-intake';
import { labelIntakeErrorResponse } from '@/lib/shipping/label-intake-errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/shipping/label-intake/purchase
 *
 * Buy a return or replacement label for an order number that is NOT in the
 * system (IRREVERSIBLE — charges the ShipStation account). The purchase is
 * claimed and recorded in `shipping_label_purchases` under the typed
 * `order_ref` with its `ship_to` (`purchaseLabelOnce`): a retry under the same
 * `clientEventId` replays, a claim that never finished answers 409. A number
 * that IS an order answers 409 — buy against the order instead.
 *
 * Body: { ref, purpose, rateId, carrierId, serviceCode, clientEventId, shipTo, parcel }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  try {
    const raw = await req.json().catch(() => ({}));
    const body = parseBody(LabelIntakePurchaseBody, raw);
    if (body instanceof NextResponse) return body;

    const outcome = await purchaseReferenceLabel(orgId, {
      ref: body.ref,
      purpose: body.purpose,
      rateId: body.rateId,
      carrierId: body.carrierId,
      serviceCode: body.serviceCode,
      clientEventId: body.clientEventId,
      customer: toShipAddress(body.shipTo),
      parcel: toParcel(body.parcel),
      staffId: ctx.staffId ?? null,
    });

    if (outcome.kind === 'in_flight') {
      return NextResponse.json(
        {
          ok: false,
          code: 'LABEL_PURCHASE_IN_FLIGHT',
          error: 'A purchase for this label is in progress or did not finish. Check ShipStation before buying again.',
        },
        { status: 409 },
      );
    }
    if (outcome.kind === 'replay' && outcome.record.status === 'voided') {
      return NextResponse.json(
        { ok: false, code: 'LABEL_PURCHASE_VOIDED', error: 'That label was voided. Get fresh rates to buy a new one.' },
        { status: 409 },
      );
    }

    const record = outcome.record;
    if (outcome.kind === 'purchased') {
      await recordAudit(pool, ctx, req, {
        source: 'api.shipping.label-intake.purchase',
        action: AUDIT_ACTION.LABEL_PURCHASED,
        entityType: AUDIT_ENTITY.SHIPMENT,
        entityId: record.id,
        after: {
          orderRef: body.ref,
          tracking: record.trackingNumber,
          carrier: record.carrierCode,
          service: record.serviceCode,
          cost: record.cost,
          currency: record.currency,
          labelId: record.labelId,
          purpose: body.purpose,
          creationType: 'bought_in_app',
        },
        extra: { clientEventId: body.clientEventId, purchaseId: record.id, referenceOnly: true },
      });
    }

    return NextResponse.json({
      ok: true,
      idempotent: outcome.kind === 'replay',
      purchaseId: record.id,
      purpose: record.purpose,
      tracking: record.trackingNumber,
      carrier: record.carrierCode,
      service: record.serviceCode,
      cost: record.cost,
      currency: record.currency,
    });
  } catch (error) {
    return labelIntakeErrorResponse(error, 'POST /api/shipping/label-intake/purchase');
  }
}, { permission: 'shipping.buy_label' });
