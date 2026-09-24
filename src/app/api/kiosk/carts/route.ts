/**
 * GET  /api/kiosk/carts — the org's open carts (last 24h, newest first, max 30)
 *                         for the Recent carts panel and the chrome badge.
 * POST /api/kiosk/carts — write the tablet's cart down for the first time:
 *                         `{ snapshot }` → `{ id, version }`, held by this tablet.
 *
 * Callers: `useKioskCartSync`.
 * Affected API: this route (device cookie, `withKioskAuth`).
 * Data schemas: `kiosk_carts` via `kiosk-carts.server`.
 * User 2026-09-24: "recent carts for juggling multiple customers at the same
 * time, IDed for multiple devices".
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { createKioskCart, listOpenKioskCarts } from '@/lib/kiosk/kiosk-carts.server';
import type { OrgId } from '@/lib/tenancy/constants';
import { NO_STORE, readCartBody } from './cart-route';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (_req: NextRequest, ctx) => {
  const carts = await listOpenKioskCarts(ctx.organizationId as OrgId, ctx.deviceId);
  return NextResponse.json({ carts }, { headers: NO_STORE });
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const body = await readCartBody(req);
  if (!body.ok) return body.res;
  const created = await createKioskCart(ctx.organizationId as OrgId, ctx.deviceId, body.snapshot);
  return NextResponse.json(created, { status: 201, headers: NO_STORE });
});
