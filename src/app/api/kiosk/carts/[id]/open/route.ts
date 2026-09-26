/** POST /api/kiosk/carts/[id]/open — pick a cart up on THIS tablet: */

import { NextRequest, NextResponse } from 'next/server';
import { openKioskCart } from '@/lib/kiosk/kiosk-carts.server';
import type { OrgId } from '@/lib/tenancy/constants';
import { NO_STORE, withKioskCart } from '../../cart-route';

export const runtime = 'nodejs';

export const POST = withKioskCart(async (_req: NextRequest, ctx, cartId) => {
  const opened = await openKioskCart(ctx.organizationId as OrgId, ctx.deviceId, cartId);
  if (!opened) {
    return NextResponse.json({ error: 'CART_NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(opened, { headers: NO_STORE });
});
