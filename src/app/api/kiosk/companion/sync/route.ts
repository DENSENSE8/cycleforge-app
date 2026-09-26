/** POST /api/kiosk/companion/sync — the tablet's heartbeat while a phone may be joined: */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { syncCompanionFromTablet } from '@/lib/kiosk/companion-link.server';
import { CompanionDevicesSchema } from '@/lib/kiosk/companion-shape';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;
const BodySchema = z.object({ devices: CompanionDevicesSchema });

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }
  const synced = await syncCompanionFromTablet(
    ctx.organizationId as OrgId,
    ctx.deviceId,
    parsed.data.devices,
  );
  if (!synced) return NextResponse.json({ error: 'NO_LINK' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(synced, { headers: NO_STORE });
});
