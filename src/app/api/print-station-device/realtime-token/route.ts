/** GET|POST /api/print-station-device/realtime-token — an Ably token for an enrolled print station: its own station channel only. */

import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import { getValidatedAblyApiKey } from '@/lib/realtime/ably-key';
import { withPrintStationAuth } from '@/lib/auth/withPrintStationAuth';
import {
  capabilityLeaksOutsideOrg,
  printStationDeviceCapability,
  printStationDeviceClientId,
} from '@/lib/realtime/kiosk-capability';

export const runtime = 'nodejs';

let ablyRestClient: Ably.Rest | null = null;

function getAblyRestClient() {
  const key = getValidatedAblyApiKey();
  if (!key) return null;
  if (!ablyRestClient) ablyRestClient = new Ably.Rest({ key });
  return ablyRestClient;
}

// Ably's `authUrl` grant issues a GET by default; same grant on both verbs.
export const POST = withPrintStationAuth(async (_req: NextRequest, ctx) => {
  const client = getAblyRestClient();
  if (!client) return NextResponse.json({ error: 'ABLY_API_KEY is not configured' }, { status: 500 });

  // Org AND station come from the verified device credential — the whole
  // boundary: Ably enforces the capability, so a station only hears its own jobs.
  const orgId = ctx.organizationId;
  const capability = printStationDeviceCapability(orgId, ctx.stationId);
  const leaked = capabilityLeaksOutsideOrg(orgId, capability);
  if (leaked) {
    return NextResponse.json({ error: 'Internal: capability leaked outside org prefix', resource: leaked }, { status: 500 });
  }

  const tokenRequest = await client.auth.createTokenRequest({
    clientId: printStationDeviceClientId(orgId, ctx.stationId),
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });
  return NextResponse.json(tokenRequest, { headers: { 'cache-control': 'no-store' } });
});
export const GET = POST;
