/** POST /api/realtime/kiosk-token — an Ably token for a DEVICE principal. */

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

// Ably's `authUrl` grant issues a GET by default (KioskRealtimeProvider passes
// no authMethod) — the route was POST-only, so every kiosk load logged a 405
// and the realtime mirror never attached. Same grant, both verbs.
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
export const GET = POST;
