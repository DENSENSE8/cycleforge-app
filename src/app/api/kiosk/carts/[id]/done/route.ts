/** POST /api/kiosk/carts/[id]/done — the visit was submitted: */

import { NextRequest, NextResponse } from 'next/server';
import { completeKioskCart } from '@/lib/kiosk/kiosk-carts.server';
import type { OrgId } from '@/lib/tenancy/constants';
import { NO_STORE, cartWriteRefusal, withKioskCart } from '../../cart-route';

export const runtime = 'nodejs';

export const POST = withKioskCart(async (_req: NextRequest, ctx, cartId) => {
  const done = await completeKioskCart(ctx.organizationId as OrgId, ctx.deviceId, cartId);
  if (!done.ok) return cartWriteRefusal(done.reason);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
});
