/** POST /api/kiosk/dev-autopair — dogfood bind to organization one. */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  KIOSK_COOKIE_NAME,
  dogfoodKioskDeviceLabel,
  issueActiveKioskDeviceToken,
  loadKioskDeviceByToken,
  newKioskClientId,
  readKioskClientId,
  revokeStaleDogfoodKioskDevices,
  setKioskCookies,
} from '@/lib/auth/kiosk-device';
import { getOrganization } from '@/lib/tenancy/organizations';

export const runtime = 'nodejs';

/** Org #1 — dogfood tenant UUID. Literal so this route does not import DOGFOOD_ORG_ID. */
const ORG_ONE = '00000000-0000-0000-0000-000000000001';

async function handleDogfoodAutopair(req: NextRequest) {
  const orgId = ORG_ONE;
  // A client that already has an id keeps it: the id IS which device row this
  // surface owns, so minting a fresh one would orphan the old row every bind.
  const existingClientId = readKioskClientId(req);
  const clientId = existingClientId ?? newKioskClientId();

  const existingToken = req.cookies.get(KIOSK_COOKIE_NAME)?.value ?? null;
  if (existingToken) {
    const device = await loadKioskDeviceByToken(existingToken);
    if (device && device.organizationId === orgId) {
      const res = NextResponse.json({ paired: true, reused: true, organizationId: orgId });
      // Backfill the client id for a browser paired before this cookie existed,
      // so its NEXT re-bind lands on its own row instead of the shared one.
      if (!existingClientId) setKioskCookies(res, { clientId });
      return res;
    }
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: 'ORG_NOT_FOUND' }, { status: 404 });
  }

  const label = dogfoodKioskDeviceLabel(clientId);
  const issued = await issueActiveKioskDeviceToken(orgId, label);
  // One row per client means E2E contexts and incognito windows each leave one behind.
  void revokeStaleDogfoodKioskDevices(orgId, label).catch(() => {});
  const res = NextResponse.json({
    paired: true,
    reused: false,
    organizationId: issued.organizationId,
    deviceId: issued.deviceId,
  });
  setKioskCookies(res, { token: issued.token, clientId });
  return res;
}

export const POST = withAuth(handleDogfoodAutopair, { allowAnonymous: true });
