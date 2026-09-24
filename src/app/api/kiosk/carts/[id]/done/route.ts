/**
 * POST /api/kiosk/carts/[id]/done — the visit was submitted: close the cart so
 * no tablet can reopen and submit it twice. Holder-only (409 `HELD_ELSEWHERE`).
 *
 * Callers: `useKioskCartSync` (store `completeCart` / Next customer).
 * Affected API: this route (device cookie, `withKioskAuth`).
 * Data schemas: `kiosk_carts.status` via `completeKioskCart`.
 * User 2026-09-24: "all under ONE cart system for sales, custom amount and
 * repair service".
 */

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
