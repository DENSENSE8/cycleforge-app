/**
 * PATCH  /api/kiosk/carts/[id] — save the cart this tablet holds:
 *        `{ snapshot, expectedVersion }` → `{ version }`.
 * DELETE /api/kiosk/carts/[id] — Clear cart: the basket is abandoned, the row goes.
 *
 * Both are holder-only. 409 `HELD_ELSEWHERE` = another tablet opened the cart
 * since; the caller lets go of it. 409 `STALE_VERSION` = this tablet's own copy
 * is behind (a second window on the same device). 404 = gone or submitted.
 *
 * Callers: `useKioskCartSync`.
 * Affected API: this route (device cookie, `withKioskAuth`).
 * Data schemas: `kiosk_carts` via `saveKioskCart` / `deleteKioskCart`.
 * User 2026-09-24: "IDed for multiple devices".
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteKioskCart, saveKioskCart } from '@/lib/kiosk/kiosk-carts.server';
import type { OrgId } from '@/lib/tenancy/constants';
import { NO_STORE, cartWriteRefusal, readCartBody, withKioskCart } from '../cart-route';

export const runtime = 'nodejs';

export const PATCH = withKioskCart(async (req: NextRequest, ctx, cartId) => {
  const body = await readCartBody(req);
  if (!body.ok) return body.res;
  if (body.expectedVersion === null) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }
  const saved = await saveKioskCart(
    ctx.organizationId as OrgId,
    ctx.deviceId,
    cartId,
    body.expectedVersion,
    body.snapshot,
  );
  if (!saved.ok) return cartWriteRefusal(saved.reason);
  return NextResponse.json({ version: saved.version }, { headers: NO_STORE });
});

export const DELETE = withKioskCart(async (_req: NextRequest, ctx, cartId) => {
  const deleted = await deleteKioskCart(ctx.organizationId as OrgId, ctx.deviceId, cartId);
  if (!deleted.ok) return cartWriteRefusal(deleted.reason);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
});
