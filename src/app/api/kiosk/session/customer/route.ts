/** PATCH /api/kiosk/session/customer — verb 1 of the tablet's three. */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getSessionForDevice, setCustomer } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deviceResult } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  phone: z.string().trim().max(32).default(''),
  name: z.string().trim().max(120).default(''),
  email: z.string().trim().max(200).default(''),
  // Callers: kioskSessionStore.setCustomer via PATCH. Schema: CounterSessionCustomer. User: "intake their information like name, email address, phone number, address"
  address: z.string().trim().max(400).default(''),
});

export const PATCH = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const orgId = ctx.organizationId as OrgId;
  const bound = await getSessionForDevice(orgId, ctx.deviceId);
  if (!bound) {
    return Response.json({ error: 'NOT_FOUND', session: null }, { status: 404 });
  }
  const { expectedVersion, ...customer } = parsed.data;

  return deviceResult(
    await fanOutCounterSession(ctx.organizationId, await setCustomer(
      orgId,
      { kind: 'kiosk', deviceId: ctx.deviceId },
      bound.sessionId,
      { expectedVersion, customer },
    ),
  ));
});
