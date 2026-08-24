/**
 * /api/sessions — start a work session, and read the one armed scan session.
 *
 * Domain: src/lib/sessions/work-sessions.ts. Table: `work_sessions`.
 *
 * House skeleton: withAuth → validate → domain helper → status map →
 * recordAudit. No business logic inline; `orgId` comes from
 * `ctx.organizationId` and is NEVER read from the body — a client that could
 * name its own tenant would be the whole tenancy model, undone.
 *
 * NO PER-SESSION PERMISSION. Ruled 2026-08-22: the shell has no per-tile
 * permission architecture. `withAuth` (a valid session) is the boundary here;
 * the DATA routes a session drives keep their own `permission` gates, which is
 * where a real capability check belongs. Adding a `sessions.*` permission would
 * gate the window manager rather than the work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { SCAN_SESSION_TYPES } from '@/lib/sessions/types';
import { getArmedScanSession, startSession } from '@/lib/sessions/work-sessions';

/** Fields both kinds carry. */
const commonFields = {
  surfaceKey: z.string().min(1).max(64).nullish(),
  deviceId: z.string().min(1).max(128).nullish(),
  clientEventId: z.uuid().nullish(),
  state: z.record(z.string(), z.unknown()).optional(),
};

/**
 * The wire contract is a DISCRIMINATED UNION, so `scanType` is required on a
 * scan and REJECTED on a task — the same iff the DB CHECK and
 * `StartSessionArgs` state. `strictObject` is what makes the rejection real: a
 * permissive object would silently strip a stray `scanType` and hand back a
 * task session the caller did not ask for.
 */
const StartBody = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('scan'),
    scanType: z.enum(SCAN_SESSION_TYPES),
    /** Arm the scan session in the same transaction that creates it. */
    arm: z.boolean().optional(),
    ...commonFields,
  }),
  z.strictObject({ kind: z.literal('task'), ...commonFields }),
]);

/** GET /api/sessions — the one armed scan session for this tenant (or null). */
export const GET = withAuth(async (_req, ctx) => {
  const armed = await getArmedScanSession({ orgId: ctx.organizationId });
  return NextResponse.json({ armed });
});

/** POST /api/sessions — start (or idempotently re-fetch) a work session. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = StartBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const common = {
    orgId: ctx.organizationId,
    surfaceKey: body.surfaceKey ?? null,
    staffId: ctx.staffId,
    deviceId: body.deviceId ?? null,
    clientEventId: body.clientEventId ?? null,
    state: body.state,
  };

  // Branch on the discriminant rather than passing `kind` through as a
  // variable — that is the point of the union, and it keeps the compiler
  // holding the iff instead of a `?? null` quietly building an invalid row.
  const result =
    body.kind === 'scan'
      ? await startSession({ ...common, kind: 'scan', scanType: body.scanType, arm: body.arm })
      : await startSession({ ...common, kind: 'task' });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // A replayed start is not a new fact — don't file a second audit row for it.
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
