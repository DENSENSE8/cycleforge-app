import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrderPaymentMethods } from '@/lib/order-payments/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/payments/methods
 * Which payment providers this org can take an order payment through right
 * now. Stripe is true only for the org's own connected Stripe account.
 */
export const GET = withAuth(async (_req, ctx) => {
  const methods = await getOrderPaymentMethods(ctx.organizationId as OrgId);
  return NextResponse.json({ ok: true, methods });
}, { permission: 'orders.view' });
