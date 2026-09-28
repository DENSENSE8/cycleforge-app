import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { getSquareInvoicePaymentFacts } from '@/lib/orders/square-invoice-import';

export const dynamic = 'force-dynamic';

const invoiceId = z.string().trim().min(1).max(255);

/**
 * GET /api/orders/intake/square-invoices/payment?invoiceId=…
 * → `{ ok, payment: SquarePaymentFacts | null }` — how a Square invoice was
 * paid, read back from Square: tender, card brand, last 4, entry method,
 * authorization code and Square's receipt link. Never a card number, expiry
 * or anything else Square holds about the card. Read-only; links nothing.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parsed = invoiceId.safeParse(req.nextUrl.searchParams.get('invoiceId') ?? '');
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invoiceId is required' }, { status: 400 });
  const result = await getSquareInvoicePaymentFacts(ctx.organizationId as OrgId, parsed.data);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, payment: result.payment });
}, { permission: 'orders.create' });
