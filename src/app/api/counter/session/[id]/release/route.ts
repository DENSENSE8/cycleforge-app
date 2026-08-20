/**
 * POST /api/counter/session/{id}/release — hand the counter back.
 *
 * Allowed on a parked session too: the lease and the cart's status are
 * independent facts, and a staffer going home should be able to release one
 * without resuming the other.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { releaseSession } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  reason: z.enum(['done', 'takeover', 'expired']).default('done'),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    return deskResult(
      await fanOutCounterSession(ctx.organizationId, await releaseSession(
        ctx.organizationId as OrgId,
        { kind: 'desk', staffId: ctx.staffId },
        sessionId,
        { expectedVersion: parsed.data.expectedVersion, reason: parsed.data.reason },
      ),
    ));
  },
  { permission: 'walk_in.intake' },
);
