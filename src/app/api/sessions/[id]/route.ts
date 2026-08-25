/**
 * /api/sessions/[id] — read one session, and drive its lifecycle.
 *
 * ONE PATCH, FOUR VERBS, rather than four sibling `/arm` `/park` `/resume`
 * `/end` route files. Every verb is the same shape — resolve the id, call one
 * domain function, map its status, file one audit row — so four files would be
 * four copies of this one with a different import. The `action` enum is the
 * only thing that varies, and the switch is exhaustive.
 *
 * Domain: src/lib/sessions/work-sessions.ts. `orgId` from `ctx.organizationId`,
 * never the body. Gate rationale (no per-session permission): ../route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import type { AuthContext } from '@/lib/auth/auth-context';
import { armScanSession, endSession, parkSession, resumeSession } from '@/lib/sessions/work-sessions';
import type { WorkSession } from '@/lib/sessions/types';

const SESSION_ACTIONS = ['arm', 'park', 'resume', 'end'] as const;
type SessionAction = (typeof SESSION_ACTIONS)[number];

/** Wire verb → the audit vocabulary's name for it (`@/lib/audit-logs`). */
const SESSION_AUDIT_ACTION: Record<SessionAction, string> = {
  arm: AUDIT_ACTION.WORK_SESSION_ARM,
  park: AUDIT_ACTION.WORK_SESSION_PARK,
  resume: AUDIT_ACTION.WORK_SESSION_RESUME,
  end: AUDIT_ACTION.WORK_SESSION_END,
};

const PatchBody = z.object({
  action: z.enum(SESSION_ACTIONS),
  /** Optimistic concurrency: reject if the session drifted from this version. */
  expectedVersion: z.number().int().min(0).optional(),
  /** `resume` only — the device taking the shell over. */
  deviceId: z.string().min(1).max(128).nullish(),
});

/**
 * withAuth's wrapper drops Next's route context, so `[id]` comes off the path —
 * the house convention for wrapped dynamic routes.
 */
function sessionIdFromPath(req: NextRequest): number | null {
  const raw = req.nextUrl.pathname.split('/').filter(Boolean).pop();
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type VerbResult =
  | { ok: true; status: 200; session: WorkSession; idempotent?: boolean; disarmedSessionIds?: number[] }
  | { ok: false; status: 400 | 404 | 409; error: string };

async function runVerb(
  action: SessionAction,
  args: { orgId: string; sessionId: number; expectedVersion?: number; staffId: number; deviceId?: string | null },
): Promise<VerbResult> {
  switch (action) {
    case 'arm':
      return armScanSession(args);
    case 'park':
      return parkSession(args);
    case 'end':
      return endSession(args);
    case 'resume':
      return resumeSession({ ...args, deviceId: args.deviceId ?? null });
  }
}

export const PATCH = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const sessionId = sessionIdFromPath(req);
  if (sessionId === null) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await runVerb(parsed.data.action, {
    orgId: ctx.organizationId,
    sessionId,
    expectedVersion: parsed.data.expectedVersion,
    staffId: ctx.staffId,
    deviceId: parsed.data.deviceId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // A no-op retry (re-arming the armed session, re-ending an ended one) is not
  // a new fact.
  if (!result.idempotent) {
    await recordAudit(pool, ctx, req, {
      source: 'sessions-api',
      action: SESSION_AUDIT_ACTION[parsed.data.action],
      entityType: AUDIT_ENTITY.WORK_SESSION,
      entityId: result.session.id,
      method: 'manual',
      after: { status: result.session.status, armed: result.session.armed },
      ...(result.disarmedSessionIds?.length
        ? { extra: { disarmed_session_ids: result.disarmedSessionIds } }
        : {}),
    });
  }

  return NextResponse.json({
    session: result.session,
    idempotent: result.idempotent ?? false,
    disarmedSessionIds: result.disarmedSessionIds ?? [],
  });
});
