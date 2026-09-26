/** POST /api/counter/session/{id}/claim — take or renew the desk lease (plan D4). */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { claimSession } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  takeover: z.boolean().optional(),
  leaseMs: z.number().int().positive().max(60 * 60 * 1000).optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const result = await claimSession(
      ctx.organizationId as OrgId,
      { kind: 'desk', staffId: ctx.staffId },
      sessionId,
      {
        expectedVersion: parsed.data.expectedVersion,
        // The holder's NAME comes from the verified session, never the body —
        // otherwise a takeover prompt could be made to name the wrong person.
        staffName: ctx.user?.name ?? 'Staff',
        takeover: parsed.data.takeover,
        leaseMs: parsed.data.leaseMs,
      },
    );
    return deskResult(await fanOutCounterSession(ctx.organizationId, result));
  },
  { permission: 'walk_in.intake' },
);
