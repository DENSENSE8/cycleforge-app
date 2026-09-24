import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import pool from '@/lib/db';
import { startPackerLogCapture } from '@/lib/packing/packer-log-writer';
import { buyerNoteHoldBody, readBuyerNoteHold } from '@/lib/orders/buyer-note-interlock';

const ROUTE = 'packing-logs.draft';

type PackingDraftResponse =
  | {
      success: true;
      packerLogId: number;
      createdAt: string;
      orderId: string;
      orderRowId: number;
      trackingNumber: string;
    }
  | ReturnType<typeof buyerNoteHoldBody>
  | { error: string };

/**
 * Start (or resume) phone packing evidence for one order.
 *
 * This deliberately does not emit a station activity, mark the order packed,
 * write a stock ledger row, or mirror allocation state. A packer log is the
 * existing photo entity, but while `completion_state=CAPTURING` it is evidence
 * storage only. `/api/packing-logs/update` is the sole completion writer.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const orderRowId = Number(body.orderId);
  if (!Number.isSafeInteger(orderRowId) || orderRowId <= 0) {
    return NextResponse.json({ error: 'orderId must be a positive integer' }, { status: 400 });
  }
  if (!Number.isSafeInteger(ctx.staffId) || ctx.staffId <= 0) {
    return NextResponse.json({ error: 'A signed-in staff member is required' }, { status: 401 });
  }

  const idempotencyKey = readIdempotencyKey(
    req,
    body.idempotencyKey ?? body.clientEventId ?? body.client_event_id ?? null,
  );

  const out = await withIdempotencyClaim<PackingDraftResponse>(pool, {
    orgId: ctx.organizationId,
    idempotencyKey,
    route: ROUTE,
    staffId: ctx.staffId,
  }, async () => {
    try {
      const result = await withTenantTransaction(ctx.organizationId, async (client) => {
        const orderResult = await client.query<{
          id: number;
          order_id: string | null;
          shipment_id: number | null;
          status: string | null;
          tracking_number: string | null;
        }>(
          `SELECT o.id,
                  o.order_id,
                  o.shipment_id,
                  o.status,
                  stn.tracking_number_raw AS tracking_number
             FROM orders o
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
            WHERE o.id = $1 AND o.organization_id = $2
            FOR UPDATE OF o`,
          [orderRowId, ctx.organizationId],
        );
        const order = orderResult.rows[0];
        if (!order) throw new Error('Order was not found.');
        // Buyer-note interlock first: the note is read before anything else
        // about starting this pack (src/lib/orders/buyer-note-interlock.ts).
        const hold = await readBuyerNoteHold(client, ctx.organizationId, order.id);
        if (hold) return { hold };
        if (order.shipment_id == null || !order.tracking_number?.trim()) {
          throw new Error('This order needs a carrier tracking number before packing can start.');
        }
        if (String(order.status ?? '').toLowerCase() === 'shipped') {
          throw new Error('This order has already left the building and cannot be packed again.');
        }

        const draft = await startPackerLogCapture(client, {
          organizationId: ctx.organizationId,
          shipmentId: order.shipment_id,
          scanRef: order.tracking_number.trim(),
          packedBy: ctx.staffId,
          source: ROUTE,
        });
        return {
          packerLogId: draft.id,
          createdAt: draft.createdAt,
          orderId: String(order.order_id ?? order.id),
          orderRowId: order.id,
          trackingNumber: order.tracking_number.trim(),
        };
      });

      if ('hold' in result && result.hold) return { status: 409, body: buyerNoteHoldBody(result.hold) };
      return { status: 201, body: { success: true, ...result } };
    } catch (error) {
      return {
        status: 409,
        body: { error: error instanceof Error ? error.message : 'Could not start packing.' },
      };
    }
  });

  return NextResponse.json(out.body, { status: out.status });
}, { permission: 'packing.complete_order' });
