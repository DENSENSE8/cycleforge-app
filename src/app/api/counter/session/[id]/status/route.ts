/**
 * POST /api/counter/session/{id}/status — park, resume, or void the visit (D8).
 *
 * `submitted` is NOT reachable here. A visit becomes submitted only by going
 * through the submit orchestrator (P8), which is what writes the transaction;
 * letting a status PATCH claim it would produce a "submitted" session with no
 * money behind it.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { setSessionStatus } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  status: z.enum(['open', 'parked', 'voided']),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    return deskResult(
      await fanOutCounterSession(ctx.organizationId, await setSessionStatus(
        ctx.organizationId as OrgId,
        { kind: 'desk', staffId: ctx.staffId },
        sessionId,
        { expectedVersion: parsed.data.expectedVersion, status: parsed.data.status },
      ),
    ));
  },
  { permission: 'walk_in.intake' },
);
