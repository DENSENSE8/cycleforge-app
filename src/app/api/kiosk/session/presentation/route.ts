/**
 * POST /api/kiosk/session/presentation — Show proposal from the tablet.
 *
 * Callers: `useKioskSharedSession` writer `setPresentation`.
 * Schema: `counter_sessions.consult_presentation` jsonb.
 * User: continue to Phase 3 Show + browser confirm. No duplicate cart.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getSessionForDevice, setConsultPresentation } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deviceResult } from '@/lib/counter/session-http';
import { parseConsultPresentation } from '@/lib/counter/consult-stance';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  presentation: z.unknown(),
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
      await setConsultPresentation(
        orgId,
        { kind: 'kiosk', deviceId: ctx.deviceId },
        bound.sessionId,
        {
          expectedVersion: parsed.data.expectedVersion,
          presentation: parseConsultPresentation(parsed.data.presentation),
        },
      ),
    ),
  );
});
