/**
 * POST /api/kiosk/carts/[id]/open — pick a cart up on THIS tablet: take the
 * hold and get `{ id, version, snapshot }`. Any paired tablet of the org may,
 * which is the point; the tablet that held it loses its next save (409) and
 * lets go, so one cart never has two writers.
 *
 * Callers: `useKioskCartSync` (Recent carts row tap).
 * Affected API: this route (device cookie, `withKioskAuth`).
 * Data schemas: `kiosk_carts` via `openKioskCart`.
 * User 2026-09-24: "recent carts for juggling multiple customers at the same
 * time, IDed for multiple devices".
 */

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
