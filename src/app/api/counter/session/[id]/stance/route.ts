/** POST /api/counter/session/{id}/stance — desk Work · Show · Verify. */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { setConsultStance } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import { CONSULT_STANCES } from '@/lib/counter/consult-stance';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  consultStance: z.enum(CONSULT_STANCES),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    return deskResult(
      await fanOutCounterSession(
        ctx.organizationId,
        await setConsultStance(
          ctx.organizationId as OrgId,
          { kind: 'desk', staffId: ctx.staffId },
          sessionId,
          {
            expectedVersion: parsed.data.expectedVersion,
            consultStance: parsed.data.consultStance,
          },
        ),
      ),
    );
  },
  { permission: 'walk_in.intake' },
);
