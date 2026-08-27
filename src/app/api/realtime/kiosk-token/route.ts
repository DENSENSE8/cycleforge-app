/**
 * POST /api/realtime/kiosk-token — an Ably token for a DEVICE principal.
 *
 * ### Why this route has to exist
 *
 * `/api/realtime/token` is `withAuth(…, { permission: 'dashboard.view' })` and
 * stamps `clientId = org:{org}:staff:{staffId}`. A kiosk tablet has no staff
 * session and no permissions at all — it authenticates as a device via the
 * `cf_kiosk` cookie — so it cannot mint a token there, and no amount of
 * loosening that route would be right: granting `dashboard.view` to an
 * unattended tablet to get it a websocket would hand it the whole org's
 * dashboard feed.
 *
 * This is the device-principal sibling, and it grants exactly one channel.
 *
 * ### The grant
 *
 * `org:{orgId}:kiosk:{deviceId}` → subscribe + publish. Nothing else: no org
 * broadcast feeds, no `db:*` row stream, no per-staff bridge. The device id
 * comes from the verified principal, never the request, so a tablet cannot ask
 * for another tablet's channel.
 *
 * Revocation is already covered: `/api/kiosk/revoke` flips the row to
 * `revoked`, `withKioskAuth` then 401s here, and the live connection dies when
 * its one-hour token expires.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P3 · D2).
 */

import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import { getValidatedAblyApiKey } from '@/lib/realtime/ably-key';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import {
  capabilityLeaksOutsideOrg,
  kioskClientId,
  kioskDeviceCapability,
} from '@/lib/realtime/kiosk-capability';

export const runtime = 'nodejs';

let ablyRestClient: Ably.Rest | null = null;

function getAblyRestClient() {
  const key = getValidatedAblyApiKey();
  if (!key) return null;
  if (!ablyRestClient) ablyRestClient = new Ably.Rest({ key });
  return ablyRestClient;
}

export const POST = withKioskAuth(async (_req: NextRequest, ctx) => {
  const client = getAblyRestClient();
  if (!client) {
    return NextResponse.json({ error: 'ABLY_API_KEY is not configured' }, { status: 500 });
  }

  // Org AND device come from the verified device principal. This is the whole
  // security boundary — Ably enforces the capability server-side, so a tablet
  // can only ever reach its own bridge.
  const orgId = ctx.organizationId;
  const capability = kioskDeviceCapability(orgId, ctx.deviceId);

  const leaked = capabilityLeaksOutsideOrg(orgId, capability);
  if (leaked) {
    return NextResponse.json(
      { error: 'Internal: capability leaked outside org prefix', resource: leaked },
      { status: 500 },
    );
  }

  const tokenRequest = await client.auth.createTokenRequest({
    clientId: kioskClientId(orgId, ctx.deviceId),
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });

  return NextResponse.json(tokenRequest, { headers: { 'cache-control': 'no-store' } });
});
