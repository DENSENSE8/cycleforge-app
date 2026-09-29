import { after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1Error } from '@/lib/api/v1-route';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { publishOrderChanged, publishShipmentChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { createOrderNote } from '@/lib/orders/order-notes';
import { labelTrailNote } from '@/lib/shipping/order-label-links';
import { labelBuyBodySchema } from '@/lib/label-buys/contracts';
import { buyLabelOutright, labelBuyErrorResponse } from '@/lib/label-buys/buy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/label-buys — buy ONE label outright (no order required). Idempotent per clientEventId. */
export const POST = withAuth(async (req, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const staffId = ctx.staffId ?? null;
  try {
    const body = await readV1Json(req, labelBuyBodySchema, 'Invalid label purchase.');
    if (!body.ok) return body.response;

    const outcome = await buyLabelOutright(orgId, body.data, staffId);
    if (outcome.kind === 'in_flight') {
      return v1Error(
        409,
        'LABEL_PURCHASE_IN_FLIGHT',
        'A purchase for this label is in progress or did not finish. Check ShipStation before buying again.',
      );
    }
    if (outcome.kind === 'voided') {
      return v1Error(409, 'LABEL_PURCHASE_VOIDED', 'That label was voided. Get fresh rates to buy a new one.');
    }
    if (outcome.kind === 'buyer_note_hold') {
      return v1Error(
        409,
        'BUYER_NOTE_UNACKNOWLEDGED',
        `Order ${body.data.reference} has a buyer note. Read and acknowledge it before buying a label for it.`,
        { extra: { orderRowId: outcome.hold.orderRowId, buyerNote: outcome.hold.buyerNote } },
      );
    }

    const { result, orderId, purpose, label, shipmentId, isFirstLabel } = outcome;
    if (!result.replayed) {
      await recordAudit(pool, ctx, req, {
        source: 'api.v1.label-buys',
        action: AUDIT_ACTION.LABEL_PURCHASED,
        entityType: orderId != null ? AUDIT_ENTITY.ORDER : AUDIT_ENTITY.SHIPMENT,
        entityId: orderId ?? result.purchaseId,
        after: {
          reference: body.data.reference,
          tracking: result.tracking,
          carrier: result.carrier,
          service: result.service,
          cost: result.cost,
          currency: result.currency,
          labelId: label.labelId,
          purpose,
          creationType: 'bought_in_app',
        },
        extra: {
          clientEventId: body.data.clientEventId,
          purchaseId: result.purchaseId,
          labelIngestionId: result.labelIngestionId,
          shipmentId,
          outright: true,
        },
      });
      if (orderId != null) {
        if (isFirstLabel) {
          await recordAudit(pool, ctx, req, {
            source: 'api.v1.label-buys',
            action: AUDIT_ACTION.LABEL_PRINTED,
            entityType: AUDIT_ENTITY.ORDER,
            entityId: orderId,
            after: { tracking: label.trackingNumber, carrier: label.carrierCode },
          });
        }
        if (purpose !== 'return') {
          await recordAudit(pool, ctx, req, {
            source: 'api.v1.label-buys',
            action: AUDIT_ACTION.TRACKING_ADDED,
            entityType: AUDIT_ENTITY.ORDER,
            entityId: orderId,
            after: { tracking: label.trackingNumber, purpose },
          });
        }
        // A return / replacement is a second story on the order — its notes trail.
        if (purpose !== 'outbound') {
          await createOrderNote({
            orderId,
            organizationId: orgId,
            noteText: labelTrailNote('Bought', purpose, label),
            staffId,
          }).catch((e) => console.warn('[label-buys] order note failed', e));
        }
        after(async () => {
          try {
            await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
            await publishOrderChanged({ organizationId: orgId, orderIds: [orderId], source: 'label-buys' });
            if (shipmentId) {
              await publishShipmentChanged({
                organizationId: orgId,
                shipmentId,
                trackingNumber: label.trackingNumber,
                source: 'label-buys',
              });
            }
          } catch (e) {
            console.warn('[label-buys] realtime/cache failed', e);
          }
        });
      }
    }

    return v1Data(result);
  } catch (error) {
    return labelBuyErrorResponse(error, 'POST /api/v1/label-buys');
  }
}, { permission: 'shipping.buy_label' });
