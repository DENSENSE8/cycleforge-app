import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { LinkLabelTicketBody } from '@/lib/schemas/order-labels';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { isHelpdeskNotConnected } from '@/lib/support/ticket-link';
import { HELPDESK_CONNECT_HINT, HELPDESK_NOT_CONNECTED_MESSAGE } from '@/lib/integrations/helpdesk';
import { linkLabelToTicket, unlinkLabelFromTicket } from '@/lib/shipping/order-label-links';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

/** /api/orders/[id]/labels/[labelId]/ticket — a label (and its order) ↔ a helpdesk ticket, through the existing `ticket_links` waist: */

function ids(raw: { id: string; labelId: string }): { orderId: number; rowId: number } | null {
  const orderId = Number(raw.id);
  const rowId = Number(raw.labelId);
  if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(rowId) || rowId <= 0) return null;
  return { orderId, rowId };
}

function helpdeskDown(): NextResponse {
  return NextResponse.json(
    { success: false, error: HELPDESK_NOT_CONNECTED_MESSAGE, details: HELPDESK_CONNECT_HINT },
    { status: 503 },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'integrations.zendesk');
    if (gate.denied) return gate.denied;

    const target = ids(await params);
    if (!target) return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(LinkLabelTicketBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await linkLabelToTicket({
      orgId: gate.ctx.organizationId as OrgId,
      orderId: target.orderId,
      rowId: target.rowId,
      ticket: parsed.ticket,
      staffId: gate.ctx.staffId ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: result.error }, { status: result.status });
    }

    if (result.added) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-labels-api',
        action: AUDIT_ACTION.LABEL_TICKET_LINKED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: target.orderId,
        after: {
          labelRowId: target.rowId,
          zendeskTicketId: result.ticketId,
          purpose: result.purpose,
          tracking: result.trackingNumber,
          orderAnchored: result.orderAnchored,
        },
        extra: { shipmentId: result.shipmentId },
      });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (isHelpdeskNotConnected(error)) return helpdeskDown();
    console.error('Error in POST /api/orders/[id]/labels/[labelId]/ticket:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not link the ticket.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'integrations.zendesk');
    if (gate.denied) return gate.denied;

    const target = ids(await params);
    const ticketId = Number(req.nextUrl.searchParams.get('ticketId'));
    if (!target || !Number.isInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const result = await unlinkLabelFromTicket({
      orgId: gate.ctx.organizationId as OrgId,
      orderId: target.orderId,
      rowId: target.rowId,
      ticketId,
      staffId: gate.ctx.staffId ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: result.error }, { status: result.status });
    }
    if (result.removed) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-labels-api',
        action: AUDIT_ACTION.LABEL_TICKET_UNLINKED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: target.orderId,
        before: { labelRowId: target.rowId, zendeskTicketId: ticketId },
        extra: { shipmentId: result.shipmentId },
      });
    }
    return NextResponse.json({ success: true, removed: result.removed });
  } catch (error) {
    if (isHelpdeskNotConnected(error)) return helpdeskDown();
    console.error('Error in DELETE /api/orders/[id]/labels/[labelId]/ticket:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not unlink the ticket.' },
      { status: 500 },
    );
  }
}
