import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { linkSquareInvoiceToOrder } from '@/lib/orders/square-invoice-import';

export const dynamic = 'force-dynamic';

const Body = z.object({
  orderNumber: z.string().trim().min(1).max(120),
  invoiceId: z.string().trim().min(1).max(255),
});

/**
 * POST /api/orders/intake/square-invoices/link { orderNumber, invoiceId }
 * After an order imported from a Square invoice is saved: record that invoice
 * as the order's payment request. The amount / status are re-read from Square;
 * the body carries no money. Idempotent per invoice.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'orderNumber and invoiceId are required' }, { status: 400 });
  const result = await linkSquareInvoiceToOrder(ctx.organizationId as OrgId, {
    orderNumber: parsed.data.orderNumber,
    invoiceId: parsed.data.invoiceId,
    staffId: ctx.staffId ?? null,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, payment: result.payment });
}, { permission: 'orders.create' });
