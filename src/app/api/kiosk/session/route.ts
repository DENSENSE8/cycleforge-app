/**
 * GET /api/kiosk/session — what THIS tablet is showing.
 *
 * The device never names a session id: it asks about itself, and the server
 * resolves the open session bound to its device principal
 * (`ux_counter_sessions_open_device` makes that at most one). A device id in a
 * request body would be a session-enumeration surface on an unattended tablet.
 *
 * `null` is the normal idle answer — no session bound, fall back to the
 * standalone local cart (plan D7). Never a 404, which would distinguish "none"
 * from "not yours".
 */

import { NextRequest } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getSessionForDevice } from '@/lib/counter/session-store';
import { deviceSnapshot } from '@/lib/counter/session-http';
import { getKioskBridgeChannelName } from '@/lib/realtime/channels';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (_req: NextRequest, ctx) => {
  const snapshot = await getSessionForDevice(ctx.organizationId as OrgId, ctx.deviceId);
  return deviceSnapshot(snapshot, getKioskBridgeChannelName(ctx.organizationId, ctx.deviceId));
});
