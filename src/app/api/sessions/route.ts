/**
 * /api/sessions — start a work session (scanner path OR purpose catalog),
 * and read the one armed scan session.
 *
 * Domain: src/lib/sessions/work-sessions.ts. Catalog: beginSession.
 * `orgId` from `ctx.organizationId`, never the body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { SCAN_SESSION_TYPES } from '@/lib/sessions/types';
import { beginSession, getArmedScanSession, startSession } from '@/lib/sessions/work-sessions';

const commonFields = {
  surfaceKey: z.string().min(1).max(64).nullish(),
  deviceId: z.string().min(1).max(128).nullish(),
  clientEventId: z.uuid().nullish(),
  state: z.record(z.string(), z.unknown()).optional(),
  title: z.string().min(1).max(200).nullish(),
  purposeId: z.number().int().positive().nullish(),
  notes: z.string().max(4000).nullish(),
};

const ScanOrTaskBody = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('scan'),
    scanType: z.enum(SCAN_SESSION_TYPES),
    arm: z.boolean().optional(),
    ...commonFields,
  }),
  z.strictObject({ kind: z.literal('task'), ...commonFields }),
]);

const ComposerBody = z
  .strictObject({
    title: z.string().min(1).max(200).optional(),
    purposeId: z.number().int().positive().optional(),
    purposeLabel: z.string().min(1).max(80).optional(),
    notes: z.string().max(4000).optional(),
    parkSessionId: z.number().int().positive().optional(),
    deviceId: z.string().min(1).max(128).nullish(),
    clientEventId: z.uuid().nullish(),
  })
  .refine((d) => d.purposeId != null || Boolean(d.purposeLabel) || Boolean(d.title), {
    message: 'PURPOSE_OR_TITLE_REQUIRED',
  });

const StartBody = z.union([ScanOrTaskBody, ComposerBody]);

export const GET = withAuth(async (_req, ctx) => {
  const armed = await getArmedScanSession({ orgId: ctx.organizationId });
  return NextResponse.json({ armed });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = StartBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;

  if (!('kind' in body)) {
    const result = await beginSession({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      deviceId: body.deviceId ?? null,
      clientEventId: body.clientEventId ?? null,
      purposeId: body.purposeId ?? null,
      purposeLabel: body.purposeLabel ?? null,
      title: body.title ?? null,
      notes: body.notes ?? null,
      parkSessionId: body.parkSessionId ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (!result.idempotent) {
      await recordAudit(pool, ctx, req, {
        source: 'sessions-api',
        action: AUDIT_ACTION.WORK_SESSION_START,
        entityType: AUDIT_ENTITY.WORK_SESSION,
        entityId: result.session.id,
        method: 'manual',
        after: {
          kind: result.session.kind,
          scan_type: result.session.scanType,
          surface_key: result.session.surfaceKey,
          purpose_id: result.session.purposeId,
          title: result.session.title,
          armed: result.session.armed,
        },
        extra: { disarmed_session_ids: result.disarmedSessionIds },
      });
    }
    return NextResponse.json(
      {
        session: result.session,
        purpose: result.purpose,
        idempotent: result.idempotent,
        disarmedSessionIds: result.disarmedSessionIds,
      },
      { status: result.status },
    );
  }

  const common = {
    orgId: ctx.organizationId,
    surfaceKey: body.surfaceKey ?? null,
    staffId: ctx.staffId,
    deviceId: body.deviceId ?? null,
    clientEventId: body.clientEventId ?? null,
    state: body.state,
    title: body.title ?? null,
    purposeId: body.purposeId ?? null,
    notes: body.notes ?? null,
  };

  const result =
    body.kind === 'scan'
      ? await startSession({ ...common, kind: 'scan', scanType: body.scanType, arm: body.arm })
      : await startSession({ ...common, kind: 'task' });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (!result.idempotent) {
    await recordAudit(pool, ctx, req, {
      source: 'sessions-api',
      action: AUDIT_ACTION.WORK_SESSION_START,
      entityType: AUDIT_ENTITY.WORK_SESSION,
      entityId: result.session.id,
      method: 'manual',
      after: {
        kind: result.session.kind,
        scan_type: result.session.scanType,
        surface_key: result.session.surfaceKey,
        armed: result.session.armed,
      },
      extra: { disarmed_session_ids: result.disarmedSessionIds },
    });
  }

  return NextResponse.json(
    {
      session: result.session,
      idempotent: result.idempotent,
      disarmedSessionIds: result.disarmedSessionIds,
    },
    { status: result.status },
  );
});
