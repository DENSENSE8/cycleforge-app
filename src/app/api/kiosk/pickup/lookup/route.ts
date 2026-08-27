/**
 * POST /api/kiosk/pickup/lookup
 *
 * Two-key Order Pickup lookup (order/RS# + phone). Device-authed; never
 * returns browsable lists. Miss and phone mismatch share a caller-safe error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { lookupKioskOrderPickup } from '@/lib/kiosk/order-pickup';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  orderNumber: z.string().trim().min(1).max(64),
  phone: z.string().trim().min(7).max(32),
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await lookupKioskOrderPickup(
    ctx.organizationId as OrgId,
    parsed.data.orderNumber,
    parsed.data.phone,
  );

  if (!result.ok) {
    // Oracle-safe: do not distinguish miss vs phone mismatch to the tablet.
    const status = result.reason === 'already_collected' ? 409 : 404;
    return NextResponse.json(
      {
        error:
          result.reason === 'already_collected'
            ? 'ALREADY_COLLECTED'
            : 'NOT_FOUND',
      },
      { status },
    );
  }

  return NextResponse.json(
    { summary: result.summary },
    { headers: { 'cache-control': 'no-store' } },
  );
});
