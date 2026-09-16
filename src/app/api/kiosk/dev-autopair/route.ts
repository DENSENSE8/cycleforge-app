/**
 * POST /api/kiosk/dev-autopair — dogfood bind to organization one.
 *
 * Callers: `useDogfoodKioskBind` on `/kiosk`, `/kiosk/v2`, `/m/consult`;
 * `healKioskBinding` on any kiosk 401.
 * Affected API: this route; sets httpOnly `cf_kiosk` + `cf_kiosk_client` for
 * `withKioskAuth`.
 * Data schemas: one `kiosk_devices` row PER CLIENT
 * ({@link dogfoodKioskDeviceLabel}).
 * User: "I don't care about the tablet pairing, I need to be able to test this
 * immediately. Whenever you open a kiosk or a tablet page, I must see it
 * automatically connected to organization one for dog food testing" — and
 * "I must be able to access the kiosk without it saying kiosk unpaired in prod
 * testing AND on localhost".
 *
 * ONE ROW PER CLIENT, not one row per org. A `kiosk_devices` row holds a single
 * `device_token_hash`, so while every dogfood surface shared the row labeled
 * "Dogfood auto-bind", each bind ROTATED the hash and killed every other
 * surface: production stole localhost's device, localhost stole it back, and
 * both painted `KIOSK_UNPAIRED` in turn. The durable `cf_kiosk_client` cookie
 * gives each browser/tablet its own row — which is what `kiosk_devices` models
 * in the first place (one row per tablet).
 *
 * No setup code. No env opt-in. Idempotent when the browser already holds a
 * valid cookie for org #1.
 */

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
  // One row per client means E2E contexts and incognito windows each leave one
  // behind. Sweep the ones nobody has used in two weeks so the LIVE credential
  // set — and Settings → Devices — stays bounded. Advisory: a failed sweep must
  // never fail the bind the operator is waiting on.
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
