/**
 * POST /api/counter/session — open a shared counter session.
 *
 * Desk-only (plan D5): the tablet never opens a shared session. A walk-up with
 * no desk keeps its standalone local cart until a desk claims the device.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { createSession } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult } from '@/lib/counter/session-http';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getKioskDefaultCommand } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  clientEventId: z.string().uuid(),
  kioskDeviceId: z.number().int().positive().nullish(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    // The opening pane is the ORG's choice, not the column default. Read here
    // because the route holds the org; `createSession`'s deps are its whole
    // I/O surface and a settings read hidden inside them would be a second one.
    const org = await getOrganization(ctx.organizationId as OrgId);

    const result = await createSession(
      ctx.organizationId as OrgId,
      { kind: 'desk', staffId: ctx.staffId },
      {
        clientEventId: parsed.data.clientEventId,
        kioskDeviceId: parsed.data.kioskDeviceId ?? null,
        activeCommand: getKioskDefaultCommand(org?.settings),
      },
    );
    return deskResult(await fanOutCounterSession(ctx.organizationId, result));
  },
  { permission: 'walk_in.intake' },
);
