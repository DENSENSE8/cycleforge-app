import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrderPaymentPanel, refreshOrderPayment, requestOrderPayment } from '@/lib/order-payments/service';

export const dynamic = 'force-dynamic';

const orderNumber = z.string().trim().min(1).max(120);

/**
 * GET /api/orders/payments?orderNumber=PH-000123[&refresh=1]
 * The payment rail's payload: the order's live charge (from its rows) and its
 * latest payment request. `refresh=1` first asks Square where an open request
 * stands (throttled) — the fallback for a missed webhook.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parsed = orderNumber.safeParse(req.nextUrl.searchParams.get('orderNumber') ?? '');
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'orderNumber is required' }, { status: 400 });
  const orgId = ctx.organizationId as OrgId;
  if (req.nextUrl.searchParams.get('refresh') === '1') {
    const current = await getOrderPaymentPanel(orgId, parsed.data);
    if (current.payment && (current.payment.status === 'pending' || current.payment.status === 'sent')) {
      await refreshOrderPayment(orgId, current.payment.id).catch((err) =>
        console.error('[order-payments] refresh failed', err instanceof Error ? err.message : err),
      );
    }
  }
  return NextResponse.json({ ok: true, ...(await getOrderPaymentPanel(orgId, parsed.data)) });
}, { permission: 'orders.view' });

const RequestBody = z.object({
  orderNumber,
  method: z.enum(['square_link', 'square_invoice']),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

/**
 * POST /api/orders/payments { orderNumber, method, idempotencyKey? }
 * Create a Square payment link or a Square invoice for the order. The amount
 * is computed here from the order's rows; the body carries no money.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = RequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'orderNumber and method are required' }, { status: 400 });
  const result = await requestOrderPayment(ctx.organizationId as OrgId, {
    orderNumber: parsed.data.orderNumber,
    method: parsed.data.method,
    staffId: ctx.staffId ?? null,
    idempotencyKey: parsed.data.idempotencyKey,
  });
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ ok: true, payment: result.payment, existing: result.existing });
}, { permission: 'orders.create' });
