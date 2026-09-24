/**
 * What every `/api/kiosk/carts…` route shares: reading the cart id off the
 * route, reading a snapshot body, and saying no the same way.
 *
 * `withKioskAuth` hands its handler the device context but not the route
 * params, so {@link withKioskCart} resolves `[id]` first and closes over it —
 * the device and org still come ONLY from the kiosk cookie.
 *
 * Callers: `carts/route.ts`, `carts/[id]/route.ts`, `carts/[id]/open`, `carts/[id]/done`.
 * Affected API: those routes. Schemas: `kiosk_carts`.
 * User 2026-09-24: "IDed for multiple devices".
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import type { KioskAuthContext } from '@/lib/auth/kiosk-context';
import type { KioskCartWriteFailure } from '@/lib/kiosk/kiosk-carts.server';
import { parseKioskCartSnapshot, type KioskCartSnapshot } from '@/lib/kiosk/kiosk-cart-snapshot';

export const NO_STORE = { 'cache-control': 'no-store' } as const;

type CartRouteContext = { params: Promise<{ id: string }> };

/**
 * The payload is kept whole (see `kiosk-cart-snapshot.ts`), so the byte count
 * is the bound on what one row can hold. Room for a few signed repair lines —
 * a signature image is the largest thing a cart carries.
 */
const MAX_BODY_BYTES = 4_000_000;

/** `{ snapshot, expectedVersion? }` off a create/save body, or the 4xx to answer. */
export async function readCartBody(
  req: NextRequest,
): Promise<
  | { ok: true; snapshot: KioskCartSnapshot; expectedVersion: number | null }
  | { ok: false; res: NextResponse }
> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'CART_TOO_LARGE' }, { status: 413, headers: NO_STORE }),
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const body = raw as { snapshot?: unknown; expectedVersion?: unknown } | null;
  const snapshot = parseKioskCartSnapshot(body?.snapshot);
  if (!snapshot) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE }),
    };
  }
  const version = body?.expectedVersion;
  return {
    ok: true,
    snapshot,
    expectedVersion: typeof version === 'number' && Number.isInteger(version) ? version : null,
  };
}

export function withKioskCart(
  handler: (req: NextRequest, ctx: KioskAuthContext, cartId: number) => Promise<Response>,
) {
  return async (req: NextRequest, route: CartRouteContext): Promise<Response> => {
    const raw = (await route.params).id;
    const cartId = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(cartId) || cartId <= 0) {
      return NextResponse.json({ error: 'INVALID_CART_ID' }, { status: 400, headers: NO_STORE });
    }
    return withKioskAuth((r, ctx) => handler(r, ctx, cartId))(req, route);
  };
}

/**
 * 404 for a cart that is gone or closed; 409 for one this tablet may not write
 * — `HELD_ELSEWHERE` is the code the tablet turns into "opened on another
 * device" and lets go of the cart.
 */
export function cartWriteRefusal(reason: KioskCartWriteFailure): NextResponse {
  if (reason === 'not_found') {
    return NextResponse.json({ error: 'CART_NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    { error: reason === 'held_elsewhere' ? 'HELD_ELSEWHERE' : 'STALE_VERSION' },
    { status: 409, headers: NO_STORE },
  );
}
