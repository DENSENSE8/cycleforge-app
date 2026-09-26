/** PATCH /api/kiosk/session/lines/{lineUuid} — the customer corrects their own line. */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getSessionForDevice, updateLine } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deviceResult } from '@/lib/counter/session-http';
import { getKioskBridgeChannelName } from '@/lib/realtime/channels';
import { KIOSK_LINE_TYPES } from '@/lib/kiosk/cart-line';
import { parseLinePayload } from '@/lib/counter/session-line-payload';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  title: z.string().trim().min(1).max(200).optional(),
  quantity: z.number().int().positive().max(99).optional(),
  payloadType: z.enum(KIOSK_LINE_TYPES).optional(),
  payload: z.unknown().optional(),
});

function lineUuidFrom(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const raw = segments[segments.lastIndexOf('lines') + 1];
  return raw && UUID_RE.test(raw) ? raw : null;
}

export const PATCH = withKioskAuth(async (req: NextRequest, ctx) => {
  const lineUuid = lineUuidFrom(req.nextUrl.pathname);
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!lineUuid || !parsed.success) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const orgId = ctx.organizationId as OrgId;
  const bound = await getSessionForDevice(orgId, ctx.deviceId);
  if (!bound) return Response.json({ error: 'NOT_FOUND', session: null }, { status: 404 });

  const { expectedVersion, payload, payloadType, ...rest } = parsed.data;
  let checked = undefined;
  if (payload !== undefined) {
    if (!payloadType) return Response.json({ error: 'PAYLOAD_TYPE_REQUIRED' }, { status: 400 });
    checked = parseLinePayload(payloadType, payload);
    if (!checked) {
      return Response.json({ error: 'INVALID_PAYLOAD', type: payloadType }, { status: 400 });
    }
  }

  return deviceResult(
    await fanOutCounterSession(
      ctx.organizationId,
      await updateLine(orgId, { kind: 'kiosk', deviceId: ctx.deviceId }, bound.sessionId, lineUuid, {
        expectedVersion,
        patch: { ...rest, ...(checked ? { payload: checked } : {}) },
      }),
    ),
    getKioskBridgeChannelName(ctx.organizationId, ctx.deviceId),
  );
});
