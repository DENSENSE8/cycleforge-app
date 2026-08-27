/**
 * GET /api/kiosk/devices
 *
 * List the tenant's enrolled kiosk tablets for Settings → Devices. Manager-only
 * (`walk_in.enroll_kiosk`). Returns management-facing facts only — never a token
 * or code hash.
 */

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
