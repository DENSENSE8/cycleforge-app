/**
 * POST /api/kiosk/session/signature — verb 2 of the tablet's three.
 *
 * Kiosk-ONLY by design, and the domain module enforces it: a signature captured
 * on the staff desktop is a signature the customer did not give. This is the
 * one asymmetry in this family that runs toward the tablet rather than away.
 *
 * A signature on a non-REPAIR line is a 422, not a silent no-op — the caller
 * asked for something that cannot mean anything.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getSessionForDevice, signLine } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deviceResult } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  lineUuid: z.string().uuid(),
  // A PNG data URL from SignaturePad. Bounded so a malformed client cannot post
  // an unbounded blob into a row every face of this session reads.
  signatureDataUrl: z.string().startsWith('data:image/').max(2_000_000),
  signatureStrokes: z.unknown().optional(),
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
    await fanOutCounterSession(ctx.organizationId, await signLine(
      orgId,
      { kind: 'kiosk', deviceId: ctx.deviceId },
      bound.sessionId,
      parsed.data.lineUuid,
      {
        expectedVersion: parsed.data.expectedVersion,
        signatureDataUrl: parsed.data.signatureDataUrl,
        signatureStrokes: parsed.data.signatureStrokes,
      },
    ),
  ));
});
