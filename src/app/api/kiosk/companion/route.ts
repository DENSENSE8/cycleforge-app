/** POST /api/kiosk/companion — the tablet opens (or re-opens) its phone link. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { openCompanionLink } from '@/lib/kiosk/companion-link.server';
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
  const link = await openCompanionLink(
    ctx.organizationId as OrgId,
    ctx.deviceId,
    parsed.data.devices,
  );
  return NextResponse.json(link, { headers: NO_STORE });
});
