/** POST /api/kiosk/pair */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import {
  pairKioskDevice,
  setKioskCookies,
} from '@/lib/auth/kiosk-device';
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { isKioskHost, kioskPathDogfoodActive, parseKioskHost } from '@/lib/tenancy/kiosk-host';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';

export const runtime = 'nodejs';

// Device tokens are long-lived; revocation is server-side (kiosk_devices.status),
// so the cookie sits near the browser 400-day ceiling — `setKioskCookies` owns
// that lifetime for pairing, dogfood bind and in-place re-bind alike.

const BodySchema = z.object({ code: z.string().trim().min(8) });

// Named handler (not inline) so the route-auth auditor cleanly classifies this
// as `withAuth (anonymous OK)` — the pairing code is the capability.
async function handlePair(req: NextRequest) {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const host = req.headers.get('host');
    const onKioskHost = isKioskHost(host);
    const isProd = process.env.NODE_ENV === 'production';

    // Path dogfood: allow pair on staff host. After J7b, require kiosk host in prod.
    if (!onKioskHost && isProd && !kioskPathDogfoodActive()) {
      return NextResponse.json({ error: 'KIOSK_HOST_REQUIRED' }, { status: 403 });
    }

    let expectedOrganizationId: string | null = null;
    if (onKioskHost) {
      const kiosk = parseKioskHost(host);
      if (!kiosk) {
        return NextResponse.json({ error: 'KIOSK_HOST_REQUIRED' }, { status: 403 });
      }
      // Prefer the proxy-stamped slug header; fall back is still host-derived.
      expectedOrganizationId = await resolveOrgIdFromRequest(req);
      if (expectedOrganizationId === NIL_ORG_ID) {
        // Unknown slug — oracle-safe miss (do not activate any device).
        return NextResponse.json({ error: 'INVALID_PAIRING_CODE' }, { status: 404 });
      }
    }

    const pairing = await pairKioskDevice(parsed.data.code, { expectedOrganizationId });
    if (!pairing) {
      // Expired, already-used, unknown, or host/org mismatch — never distinguish.
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
    setKioskCookies(res, { token: pairing.token });
    // Clear any stray staff session on the kiosk host so a tablet profile
    // never coexists staff + device principals.
    if (onKioskHost) {
      res.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    }
    return res;
}

export const POST = withAuth(handlePair, { allowAnonymous: true });
