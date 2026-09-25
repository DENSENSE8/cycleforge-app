import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { LinkOrderLabelBody } from '@/lib/schemas/order-labels';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { createOrderNote } from '@/lib/orders/order-notes';
import { labelTrailNote, linkOrderLabel, searchLabelLinkCandidates } from '@/lib/shipping/order-label-links';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

/**
 * /api/orders/[id]/labels — pair ShipStation labels with this order.
 *
 * GET  ?q=   Link-label candidates: empty → this order's own ShipStation
 *            shipments + every quarantined ShipStation label; a tracking # or
 *            ShipStation order # → persisted refs first, a live v1 lookup when
 *            nothing local matches (an explicit search, never a render).
 * POST       { shipstationShipmentId, purpose, clientEventId } — link one
 *            label under a purpose (outbound / return / replacement), same
 *            order number and name. A quarantined label (e.g. the second live
 *            label on one order) resolves as LINKED. Audited (LABEL_LINKED on
 *            the order timeline) + the order's notes trail.
 *
 * The order's label LIST is `GET /api/orders/[id]/label-purchase` (`labels`).
 * Domain logic: lib/shipping/order-label-links.
 */

function orderIdFrom(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'shipping.buy_label');
    if (gate.denied) return gate.denied;

    const orderId = orderIdFrom((await params).id);
    if (orderId == null) return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });

    const q = req.nextUrl.searchParams.get('q');
    const result = await searchLabelLinkCandidates(
      gate.ctx.organizationId as OrgId,
      orderId,
      q && q.length <= 64 ? q : null,
    );
    if (!result) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error in GET /api/orders/[id]/labels:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not search labels.' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'shipping.buy_label');
    if (gate.denied) return gate.denied;

    const orderId = orderIdFrom((await params).id);
    if (orderId == null) return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(LinkOrderLabelBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId as OrgId;
    const staffId = gate.ctx.staffId ?? null;
    const result = await linkOrderLabel({
      orgId,
      orderId,
      shipmentId: parsed.shipstationShipmentId,
      purpose: parsed.purpose,
      clientEventId: parsed.clientEventId,
      staffId,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-labels-api',
        action: AUDIT_ACTION.LABEL_LINKED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: orderId,
        after: {
          labelRowId: result.rowId,
          labelId: result.label.labelId,
          purpose: result.purpose,
          creationType: 'linked_manually',
          tracking: result.label.trackingNumber,
          carrier: result.label.carrierCode,
          cost: result.label.cost,
        },
        extra: {
          resolvedIngestionId: result.resolvedIngestionId,
          trackingShipmentId: result.trackingShipmentId,
          clientEventId: parsed.clientEventId,
        },
      });
      await createOrderNote({
        orderId,
        organizationId: orgId,
        noteText: labelTrailNote('Linked', result.purpose, result.label),
        staffId,
      }).catch((e) => console.warn('[label-link] order note failed', e));
      after(async () => {
        try {
          await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
          await publishOrderChanged({ organizationId: orgId, orderIds: [orderId], source: 'outbound.label-link' });
        } catch (e) {
          console.warn('[label-link] realtime/cache failed', e);
        }
      });
    }

    return NextResponse.json(
      { success: true, id: result.rowId, idempotent: result.idempotent, purpose: result.purpose },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error) {
    console.error('Error in POST /api/orders/[id]/labels:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not link the label.' },
      { status: 500 },
    );
  }
}
