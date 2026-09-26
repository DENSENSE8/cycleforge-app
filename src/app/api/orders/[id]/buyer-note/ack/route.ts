import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { audit } from '@/lib/auth/audit';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { acknowledgeBuyerNote } from '@/lib/orders/buyer-note-interlock';

/** POST /api/orders/[id]/buyer-note/ack */
const ACK_PERMISSIONS = ['packing.complete_order', 'shipping.buy_label'] as const;

export const POST = withAuth(async (request, ctx) => {
  if (!ACK_PERMISSIONS.some((p) => ctx.permissions.has(p))) {
    await audit({
      staffId: ctx.staffId,
      event: 'permission.denied',
      result: 'denied',
      sid: ctx.session?.sid ?? null,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
      detail: { permission: ACK_PERMISSIONS.join('|'), api: true, path: request.nextUrl.pathname },
    });
    return NextResponse.json(
      { error: 'FORBIDDEN', permission: ACK_PERMISSIONS.join('|'), role: ctx.role },
      { status: 403 },
    );
  }

  // /api/orders/{id}/buyer-note/ack → third-from-last segment.
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const orderRowId = Number(segments[segments.length - 3]);
  if (!Number.isSafeInteger(orderRowId) || orderRowId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid order id' }, { status: 400 });
  }

  const result = await withTenantTransaction(ctx.organizationId, (client) =>
    acknowledgeBuyerNote(client, {
      organizationId: ctx.organizationId,
      orderRowId,
      staffId: Number.isSafeInteger(ctx.staffId) && ctx.staffId > 0 ? ctx.staffId : null,
    }),
  );

  if (!result.ok) {
    return result.reason === 'not_found'
      ? NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })
      : NextResponse.json({ ok: false, error: 'This order has no buyer note' }, { status: 409 });
  }

  if (!result.duplicate) {
    await recordAudit(pool, ctx, request, {
      source: 'buyer-note-ack',
      action: AUDIT_ACTION.ORDER_BUYER_NOTE_ACKNOWLEDGED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: result.orderRowId,
      after: { buyerNote: result.buyerNote, noteSha: result.noteSha },
    });
  }

  return NextResponse.json({
    ok: true,
    orderRowId: result.orderRowId,
    noteSha: result.noteSha,
    duplicate: result.duplicate,
  });
});
