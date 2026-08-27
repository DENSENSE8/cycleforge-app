/**
 * POST /api/kiosk/dev-autopair — LOCAL-DEV-ONLY convenience.
 *
 * Hand-carrying a Settings → Devices pairing code every time you restart the
 * dev server is friction with zero security value on a machine only the
 * developer can reach. This silently pairs the calling browser to a fixed
 * dogfood org, chaining the exact same `createKioskEnrollment` →
 * `pairKioskDevice` calls Settings → Devices and the tablet already use — no
 * new device-row logic, just automated instead of hand-carried.
 *
 * Hard-gated so it can never activate outside a developer's own box:
 *   - 404s immediately in production (NODE_ENV check, not env-var trust alone).
 *   - No-ops (404) unless BOTH `KIOSK_DEV_AUTOPAIR_ORG_SLUG` and
 *     `KIOSK_DEV_AUTOPAIR_STAFF_ID` are set in `.env.local` — an explicit,
 *     per-developer opt-in, never a default.
 *
 * Idempotent: a request that already carries a valid `cf_kiosk` cookie is a
 * no-op, so calling this on every `/kiosk` mount doesn't spawn a fresh device
 * row (and a fresh audit entry) on every page load.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  createKioskEnrollment,
  loadKioskDeviceByToken,
  pairKioskDevice,
  KIOSK_COOKIE_NAME,
} from '@/lib/auth/kiosk-device';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

// Short-lived on purpose — this code is never shown to anyone, it's consumed
// server-side in the same request that mints it.
const AUTOPAIR_CODE_TTL_MINUTES = 5;

async function handleDevAutopair(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const orgSlug = process.env.KIOSK_DEV_AUTOPAIR_ORG_SLUG?.trim();
  const staffId = Number(process.env.KIOSK_DEV_AUTOPAIR_STAFF_ID?.trim());
  if (!orgSlug || !Number.isFinite(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const existingToken = req.cookies.get(KIOSK_COOKIE_NAME)?.value ?? null;
  if (existingToken && (await loadKioskDeviceByToken(existingToken))) {
    return NextResponse.json({ paired: true, reused: true });
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return NextResponse.json({ error: 'ORG_NOT_FOUND' }, { status: 404 });
  }

  const enrollment = await createKioskEnrollment(org.id, {
    label: 'Dev Auto-Pair (local)',
    enrolledByStaffId: staffId,
    ttlMinutes: AUTOPAIR_CODE_TTL_MINUTES,
  });
  const pairing = await pairKioskDevice(enrollment.code, { expectedOrganizationId: org.id });
  if (!pairing) {
    return NextResponse.json({ error: 'AUTOPAIR_FAILED' }, { status: 500 });
  }

  await recordAudit(pool, null, req, {
    source: 'kiosk',
    action: AUDIT_ACTION.KIOSK_PAIRED,
    entityType: AUDIT_ENTITY.KIOSK_DEVICE,
    entityId: pairing.deviceId,
    organizationIdOverride: pairing.organizationId,
    extra: { via: `kiosk_device:${pairing.deviceId}`, label: pairing.label, devAutopair: true },
  });

  const res = NextResponse.json({ paired: true, reused: false, organizationId: pairing.organizationId });
  res.cookies.set(KIOSK_COOKIE_NAME, pairing.token, {
    httpOnly: true,
    secure: false, // dev-only route, guarded above to never run in production
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const POST = withAuth(handleDevAutopair, { allowAnonymous: true });
