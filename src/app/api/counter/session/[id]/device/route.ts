/**
 * POST /api/counter/session/{id}/device — put this visit on a tablet.
 *
 * Its own verb, not a field on some general header PATCH: which screen the
 * customer is reading is not the same kind of fact as their phone number, and
 * `DEVICE_BUSY` is a refusal only this write can produce.
 *
 * `kioskDeviceId: null` hands the tablet back — a real act (the counter goes
 * desk-only and the iPad returns to its own local cart), not a missing field,
 * so the body requires the key rather than treating absence as unbind.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P5).
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { bindSessionDevice } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  kioskDeviceId: z.number().int().positive().nullable(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    // The path here is `…/session/{id}/device`, so the id is not the last
    // segment — `sessionIdFromPath` reads the segment after `session`.
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const result = await bindSessionDevice(
      ctx.organizationId as OrgId,
      { kind: 'desk', staffId: ctx.staffId },
      sessionId,
      {
        expectedVersion: parsed.data.expectedVersion,
        kioskDeviceId: parsed.data.kioskDeviceId,
      },
    );
    return deskResult(await fanOutCounterSession(ctx.organizationId, result));
  },
  { permission: 'walk_in.intake' },
);
