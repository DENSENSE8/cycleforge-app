/** Gate preamble (Fact-Forcing): */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listKioskSlotEvents } from '@/lib/kiosk/kiosk-slot-events';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (_req, ctx) => {
    const events = await listKioskSlotEvents(ctx.organizationId);
    return NextResponse.json({ events });
  },
  { permission: 'walk_in.enroll_kiosk' },
);
