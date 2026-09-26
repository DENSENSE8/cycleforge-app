/** GET /api/kiosk/session — what THIS tablet is showing. */

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
