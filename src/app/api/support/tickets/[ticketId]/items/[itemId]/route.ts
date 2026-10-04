/** DELETE /api/support/tickets/[ticketId]/items/[itemId] — undo one logged "Product sent to customer". */

import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { deleteTicketItem } from '@/lib/support/ticket-items';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string; itemId: string }> },
) {
  const gate = await requireRoutePerm(req, 'integrations.zendesk');
  if (gate.denied) return gate.denied;
  try {
    const raw = await params;
    const ticketId = Number(raw.ticketId);
    const itemId = Number(raw.itemId);
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0 || !Number.isSafeInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const before = await deleteTicketItem({ orgId: gate.ctx.organizationId, zendeskTicketId: ticketId, itemId });
    if (!before) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    await recordAudit(pool, gate.ctx, req, {
      source: 'support-ticket-items-api',
      action: AUDIT_ACTION.SUPPORT_TICKET_ITEM_REMOVE,
      entityType: AUDIT_ENTITY.SUPPORT_TICKET_ITEM,
      entityId: itemId,
      method: 'manual',
      before: {
        ticketId,
        skuCatalogId: before.product.skuCatalogId,
        sku: before.product.sku,
        role: before.role,
        qty: before.qty,
        zendeskCommentId: before.zendeskCommentId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/support/tickets/[ticketId]/items/[itemId]:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove ticket item' }, { status: 500 });
  }
}
