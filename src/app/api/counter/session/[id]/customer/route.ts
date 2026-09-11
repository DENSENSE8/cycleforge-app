/**
 * PATCH /api/counter/session/{id}/customer — set the visit's identity.
 *
 * One of the two verbs BOTH doors hold (the tablet's twin is
 * `/api/kiosk/session/customer`). Deterministic identity only, per the parent
 * plan's D7: a phone number unlocks create-or-match at submit. There is no
 * search here and there must never be one — the device principal is
 * unattended-capable, so a searchable customer list is a list a stranger reads.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { setCustomer } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  phone: z.string().trim().max(32).default(''),
  name: z.string().trim().max(120).default(''),
  email: z.string().trim().max(200).default(''),
  // Callers: CounterWorkspace. API: PATCH /api/counter/session/[id]/customer. Schema: CounterSessionCustomer. User: "intake their information like name, email address, phone number, address"
  address: z.string().trim().max(400).default(''),
});

export const PATCH = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    const { expectedVersion, ...customer } = parsed.data;

    return deskResult(
      await fanOutCounterSession(ctx.organizationId, await setCustomer(
        ctx.organizationId as OrgId,
        { kind: 'desk', staffId: ctx.staffId },
        sessionId,
        { expectedVersion, customer },
      ),
    ));
  },
  { permission: 'walk_in.intake' },
);
