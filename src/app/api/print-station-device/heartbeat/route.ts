/** POST /api/print-station-device/heartbeat — the enrolled station is alive; answers its org name and whether it is paused. */

import { NextRequest, NextResponse } from 'next/server';
import { withPrintStationAuth } from '@/lib/auth/withPrintStationAuth';
import { printStationDeviceHeartbeatBodySchema } from '@/lib/print/print-station-registry-contracts';
import { recordEnrolledStationHeartbeat } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

export const POST = withPrintStationAuth(async (req: NextRequest, ctx) => {
  const parsed = printStationDeviceHeartbeatBodySchema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const state = await recordEnrolledStationHeartbeat(ctx.organizationId, ctx.stationId, parsed.data);
  if (!state) return NextResponse.json({ error: 'PRINT_STATION_UNPAIRED' }, { status: 401 });
  return NextResponse.json(state, { headers: { 'cache-control': 'no-store' } });
});
