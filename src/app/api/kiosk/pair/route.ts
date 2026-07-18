/**
 * POST /api/kiosk/pair
 *
 * A tablet exchanges its one-time pairing code (from /api/kiosk/enroll) for a
 * long-lived device token, and receives it as the httpOnly `cf_kiosk` cookie.
 * No human login — after this the device authenticates as itself via
 * `withKioskAuth`. Single-use + time-limited: a replayed or expired code
 * matches nothing.
 *
 * Public by design (`allowAnonymous`) — the pairing CODE is the capability, the
 * same shape as /api/auth/enroll consuming an enrollment token. The org is read
 * from the matched device row, never from the request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { pairKioskDevice, KIOSK_COOKIE_NAME } from '@/lib/auth/kiosk-device';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

// Device tokens are long-lived; revocation is server-side (kiosk_devices.status),
// so the cookie can sit near the browser 400-day ceiling.
const KIOSK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const BodySchema = z.object({ code: z.string().trim().min(8) });

// Named handler (not inline) so the route-auth auditor cleanly classifies this
// as `withAuth (anonymous OK)` — the pairing code is the capability.
async function handlePair(req: NextRequest) {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const pairing = await pairKioskDevice(parsed.data.code);
    if (!pairing) {
      // Expired, already-used, or unknown code — never distinguish (no oracle).
      return NextResponse.json({ error: 'INVALID_PAIRING_CODE' }, { status: 404 });
    }

    // ctx is null (anonymous) — stamp the org from the paired row so the audit
    // row is tenant-filterable; attribute to no staff (a device paired itself).
    await recordAudit(pool, null, req, {
      source: 'kiosk',
      action: AUDIT_ACTION.KIOSK_PAIRED,
      entityType: AUDIT_ENTITY.KIOSK_DEVICE,
      entityId: pairing.deviceId,
      organizationIdOverride: pairing.organizationId,
      extra: { via: `kiosk_device:${pairing.deviceId}`, label: pairing.label },
    });

    const res = NextResponse.json({
      ok: true,
      deviceId: pairing.deviceId,
      label: pairing.label,
    });
    res.cookies.set(KIOSK_COOKIE_NAME, pairing.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: KIOSK_COOKIE_MAX_AGE_SECONDS,
    });
    return res;
}

export const POST = withAuth(handlePair, { allowAnonymous: true });
