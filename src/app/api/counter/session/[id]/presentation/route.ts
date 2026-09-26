/** POST /api/counter/session/{id}/presentation — desk Show proposal. */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { setConsultPresentation } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import { parseConsultPresentation } from '@/lib/counter/consult-stance';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  presentation: z.unknown(),
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
        await setConsultPresentation(
          ctx.organizationId as OrgId,
          { kind: 'desk', staffId: ctx.staffId },
          sessionId,
          {
            expectedVersion: parsed.data.expectedVersion,
            presentation: parseConsultPresentation(parsed.data.presentation),
          },
        ),
      ),
    );
  },
  { permission: 'walk_in.intake' },
);
