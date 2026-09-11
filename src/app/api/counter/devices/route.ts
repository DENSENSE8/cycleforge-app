/**
 * GET /api/counter/devices — which tablet the desk may put this visit on.
 *
 * `walk_in.intake`, the counter's own permission — deliberately NOT
 * `walk_in.enroll_kiosk`, which gates the Settings fleet list
 * (`/api/kiosk/devices`). Those are different questions asked by different
 * people: a manager enrols and revokes tablets; a staffer at the counter asks
 * which iPad is in front of them and whether it is free. Widening the manager
 * route would have handed every counter staffer enrolment reach to get a
 * picker, so this is the narrow read instead — label, presence, busy. No
 * token, no code hash, no enrolment metadata.
 *
 * `?session=` is the visit doing the asking, so its own tablet is not reported
 * as held by another visit. It is a scoping hint for one boolean, never an
 * authorization input — the org comes from the verified staff session.
 *
 * Never reachable by a device principal: `src/proxy.ts` allowlists kiosk
 * prefixes only, and this route runs under `withAuth`.
 */

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
