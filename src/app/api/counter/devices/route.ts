/** GET /api/counter/devices — which tablet the desk may put this visit on. */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { listCounterDevices } from '@/lib/counter/counter-devices';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const raw = Number(req.nextUrl.searchParams.get('session'));
    const sessionId = Number.isInteger(raw) && raw > 0 ? raw : null;

    const devices = await listCounterDevices(ctx.organizationId as OrgId, sessionId);
    // A cached device list is a wrong device list — presence is the payload.
    return NextResponse.json({ devices }, { headers: { 'cache-control': 'no-store' } });
  },
  { permission: 'walk_in.intake' },
);
