/**
 * POST /api/kiosk/dev-autopair — dogfood bind to organization one.
 *
 * Callers: `useDogfoodKioskBind` on `/kiosk`, `/kiosk/v2`, `/m/consult`.
 * Affected API: this route; sets httpOnly `cf_kiosk` for `withKioskAuth`.
 * Data schemas: `kiosk_devices` row labeled {@link DOGFOOD_KIOSK_DEVICE_LABEL}.
 * User: "I don't care about the tablet pairing, I need to be able to test this
 * immediately. Whenever you open a kiosk or a tablet page, I must see it
 * automatically connected to organization one for dog food testing".
 *
 * No setup code. No env opt-in. Idempotent when the browser already holds a
 * valid cookie for org #1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  DOGFOOD_KIOSK_DEVICE_LABEL,
  KIOSK_COOKIE_NAME,
  issueActiveKioskDeviceToken,
  loadKioskDeviceByToken,
} from '@/lib/auth/kiosk-device';
import { getOrganization } from '@/lib/tenancy/organizations';

export const runtime = 'nodejs';

/** Org #1 — dogfood tenant UUID. Literal so this route does not import DOGFOOD_ORG_ID. */
const ORG_ONE = '00000000-0000-0000-0000-000000000001';

const KIOSK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

async function handleDogfoodAutopair(req: NextRequest) {
  const orgId = ORG_ONE;
  const existingToken = req.cookies.get(KIOSK_COOKIE_NAME)?.value ?? null;
  if (existingToken) {
    const device = await loadKioskDeviceByToken(existingToken);
    if (device && device.organizationId === orgId) {
      return NextResponse.json({ paired: true, reused: true, organizationId: orgId });
    }
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: 'ORG_NOT_FOUND' }, { status: 404 });
  }

  const issued = await issueActiveKioskDeviceToken(orgId, DOGFOOD_KIOSK_DEVICE_LABEL);
  const res = NextResponse.json({
    paired: true,
    reused: false,
    organizationId: issued.organizationId,
    deviceId: issued.deviceId,
  });
  res.cookies.set(KIOSK_COOKIE_NAME, issued.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: KIOSK_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}

export const POST = withAuth(handleDogfoodAutopair, { allowAnonymous: true });
