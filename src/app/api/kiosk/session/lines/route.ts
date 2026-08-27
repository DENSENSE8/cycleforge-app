/**
 * POST /api/kiosk/session/lines — the customer stages a line.
 *
 * The counter is a form two people fill at once (D5, revised 2026-08-20): the
 * customer describes what they brought in on the tablet while staff price it on
 * the desktop. So a tablet may CREATE a line — but never priced.
 *
 * `unitAmountCents` is absent from this schema on purpose, not defaulted to
 * something a caller could override. A device principal outlives the customer
 * standing at it; anything it can do, a stranger can do after they leave.
 * Describing a device costs a correction, pricing one is an open till.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { addLine, getSessionForDevice } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deviceResult } from '@/lib/counter/session-http';
import { getKioskBridgeChannelName } from '@/lib/realtime/channels';
import { KIOSK_LINE_TYPES } from '@/lib/kiosk/cart-line';
import { parseLinePayload } from '@/lib/counter/session-line-payload';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  lineUuid: z.string().uuid(),
  type: z.enum(KIOSK_LINE_TYPES),
  title: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(99).default(1),
  payload: z.unknown().default({}),
  sortIndex: z.number().int().min(0).max(9_999).default(0),
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const orgId = ctx.organizationId as OrgId;
  const bound = await getSessionForDevice(orgId, ctx.deviceId);
  if (!bound) return Response.json({ error: 'NOT_FOUND', session: null }, { status: 404 });

  const { expectedVersion, payload, ...line } = parsed.data;
  const checked = parseLinePayload(line.type, payload);
  if (!checked) {
    return Response.json({ error: 'INVALID_PAYLOAD', type: line.type }, { status: 400 });
  }

  return deviceResult(
    await fanOutCounterSession(
      ctx.organizationId,
      await addLine(
        orgId,
        { kind: 'kiosk', deviceId: ctx.deviceId },
        bound.sessionId,
        // Zero, always: staff price it from the desk.
        { expectedVersion, line: { ...line, payload: checked, unitAmountCents: 0 } },
      ),
    ),
    getKioskBridgeChannelName(ctx.organizationId, ctx.deviceId),
  );
});
