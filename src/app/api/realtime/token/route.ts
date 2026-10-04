import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import { getValidatedAblyApiKey } from '@/lib/realtime/ably-key';
import {
  orgChannelPrefix,
  getOrdersChannelName,
  getRepairsChannelName,
  getAiAssistChannelName,
  getAiAssistSessionChannelName,
  getStationChannelName,
  getStaffChannelName,
  getFbaChannelName,
  getDashboardChannelName,
  getWalkInChannelName,
  getInboxChannelName,
  getPhoneBridgeChannelName,
  getPackerBridgeChannelName,
  getStaffPrintBridgeChannelName,
  getStaffStationBridgeChannelName,
  getDbChannelPrefix,
  getMasterPlanChannel,
  getOpsPlansChannelName,
  getForgeRunsChannelName,
  printBridgeStaffId,
  getPrintStationChannelPattern,
} from '@/lib/realtime/channels';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { deskKioskCapability } from '@/lib/realtime/kiosk-capability';
import { listClaimedDeviceIds } from '@/lib/counter/session-store';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

let ablyRestClient: Ably.Rest | null = null;

function sanitizeSessionId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().slice(0, 120);
  if (!normalized) return null;
  return normalized.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

function getAblyRestClient() {
  const key = getValidatedAblyApiKey();
  if (!key) return null;
  if (!ablyRestClient) {
    ablyRestClient = new Ably.Rest({ key });
  }
  return ablyRestClient;
}

async function createTokenRequest(req: NextRequest, ctx: AuthContext) {
  const client = getAblyRestClient();
  if (!client) {
    return NextResponse.json(
      { error: 'ABLY_API_KEY is not configured' },
      { status: 500 }
    );
  }

  // Org + identity come from the verified SESSION, never the request.
  // the entire security boundary: Ably enforces these capabilities server-side,
  const orgId = ctx.organizationId;
  const staffId = ctx.staffId;
  const prefix = orgChannelPrefix(orgId); // throws on a non-uuid org → 500 (fail closed)

  // clientId stamps every message this connection publishes — a client can no
  // longer forge another staffer's identity via a header (the old x-user-id).
  const clientId = `org:${orgId}:staff:${staffId}`;

  const sessionId = sanitizeSessionId(req.headers.get('x-ai-session'));
  const aiSessionChannel = sessionId ? getAiAssistSessionChannelName(orgId, sessionId) : null;

  // Own per-staff channels — subscribe + publish for THIS staffId only.
  const inboxOwn = getInboxChannelName(orgId, staffId);
  const phoneOwn = getPhoneBridgeChannelName(orgId, staffId);
  const packerOwn = getPackerBridgeChannelName(orgId, staffId);
  // Production: this staffer's own channel. Non-production: the shared test
  // channel (`printBridgeStaffId`), so any staffer can test one printer.
  const printOwn = getStaffPrintBridgeChannelName(orgId, printBridgeStaffId(staffId));
  const staffStationOwn = getStaffStationBridgeChannelName(orgId, staffId);

  const capability: Record<string, string[]> = {
    // Org-wide broadcast feeds — read-only for clients (servers publish via REST key).
    [getOrdersChannelName(orgId)]: ['subscribe'],
    [getRepairsChannelName(orgId)]: ['subscribe'],
    [getAiAssistChannelName(orgId)]: ['subscribe'],
    [getStationChannelName(orgId)]: ['subscribe'],
    [getStaffChannelName(orgId)]: ['subscribe'],
    [getFbaChannelName(orgId)]: ['subscribe'],
    [getDashboardChannelName(orgId)]: ['subscribe'],
    [getWalkInChannelName(orgId)]: ['subscribe'],

    // Per-org DB-row feed — the wildcard is SCOPED to this org's prefix only,
    // so it can never reach another tenant's `org:{other}:db:*`.
    [`${getDbChannelPrefix(orgId)}:*`]: ['subscribe'],

    // Per-staff bridges — NO cross-staff wildcard. Only THIS staffId's channels,
    // each device side may both publish and subscribe to its own pair.
    [inboxOwn]: ['subscribe', 'publish'],
    [phoneOwn]: ['subscribe', 'publish'],
    [packerOwn]: ['subscribe', 'publish'],
    [printOwn]: ['subscribe', 'publish'],
    [staffStationOwn]: ['subscribe', 'publish'],
  };

  if (aiSessionChannel) {
    capability[aiSessionChannel] = ['subscribe', 'publish'];
  }

  // Counter bridges for the tablets THIS staffer currently holds a live lease on (docs/todo/kiosk-desk-session-channel-PLAN.md P3).
  if (ctx.permissions.has('walk_in.view')) {
    const claimed = await listClaimedDeviceIds(orgId as OrgId, staffId);
    Object.assign(capability, deskKioskCapability(orgId, claimed));
  }

  // Agentic-loop master plan (Yjs over Ably) + ops-plans change feed.
  if (ctx.permissions.has('operations.plans.view')) {
    capability[getOpsPlansChannelName(orgId)] = ['subscribe'];
    capability[getMasterPlanChannel(orgId)] = ctx.permissions.has('operations.plans.manage')
      ? ['subscribe', 'publish']
      : ['subscribe'];
  }

  // Forge run feed — read-only, mirrors the GET /api/forge/runs permission.
  if (ctx.permissions.has('assistant.chat')) {
    capability[getForgeRunsChannelName(orgId)] = ['subscribe'];
  }

  // Org print stations — any staffer who may print reaches a named station,
  // and a station hears the jobs addressed to it. Scoped to this org's prefix.
  if (ctx.permissions.has('print.label')) {
    capability[getPrintStationChannelPattern(orgId)] = ['subscribe', 'publish'];
  }

  // Defense in depth: assert every granted resource is inside this org's prefix.
  // A future builder regression that leaked a bare/global name fails closed here.
  for (const resource of Object.keys(capability)) {
    if (!resource.startsWith(`${prefix}:`)) {
      return NextResponse.json(
        { error: 'Internal: capability leaked outside org prefix', resource },
        { status: 500 },
      );
    }
  }

  const tokenRequest = await client.auth.createTokenRequest({
    clientId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });

  return NextResponse.json(tokenRequest);
}

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  return await createTokenRequest(req, ctx);
}, { permission: 'dashboard.view' });

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  return await createTokenRequest(req, ctx);
}, { permission: 'dashboard.view' });
