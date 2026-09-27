import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { cancelOrderPayment } from '@/lib/order-payments/service';

export const dynamic = 'force-dynamic';

const Body = z.object({ id: z.number().int().positive() });

/**
 * POST /api/orders/payments/cancel { id }
 * Delete the Square payment link / cancel (or delete, if still a draft) the
 * Square invoice, then mark the request cancelled. A paid request is refused.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });
  const result = await cancelOrderPayment(ctx.organizationId as OrgId, parsed.data.id);
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ ok: true, payment: result.payment });
}, { permission: 'orders.create' });
