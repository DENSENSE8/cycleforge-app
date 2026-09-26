/** GET /api/kiosk/devices */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listKioskDevices } from '@/lib/auth/kiosk-device';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (_req, ctx) => {
    const devices = await listKioskDevices(ctx.organizationId);
    return NextResponse.json({ devices });
  },
  { permission: 'walk_in.enroll_kiosk' },
);
