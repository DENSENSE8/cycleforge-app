/** POST /api/kiosk/session/stance — Work · Show · Verify from the tablet. */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getSessionForDevice, setConsultStance } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deviceResult } from '@/lib/counter/session-http';
import { CONSULT_STANCES } from '@/lib/counter/consult-stance';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  consultStance: z.enum(CONSULT_STANCES),
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const orgId = ctx.organizationId as OrgId;
  const bound = await getSessionForDevice(orgId, ctx.deviceId);
  if (!bound) {
    return Response.json({ error: 'NOT_FOUND', session: null }, { status: 404 });
  }

  return deviceResult(
    await fanOutCounterSession(
      ctx.organizationId,
      await setConsultStance(
        orgId,
        { kind: 'kiosk', deviceId: ctx.deviceId },
        bound.sessionId,
        {
          expectedVersion: parsed.data.expectedVersion,
          consultStance: parsed.data.consultStance,
        },
      ),
    ),
  );
});
