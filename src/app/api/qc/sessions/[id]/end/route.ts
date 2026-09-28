import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { qcSessionEndBodySchema } from '@/lib/qc/contracts';
import { endQcSession } from '@/lib/qc/sessions';

/** POST /api/qc/sessions/[id]/end — end the caller's unit session (`ended_at = NOW()`), with an optional outcome + notes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'tech.qc_pass');
  if (gate.denied) return gate.denied;
  const ctx = gate.ctx;

  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
  }
  const body = parseBody(qcSessionEndBodySchema, await req.json().catch(() => ({})));
  if (body instanceof NextResponse) return body;

  const result = await endQcSession(ctx.organizationId, ctx.staffId, sessionId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...data } = result;

  if (result.changed) {
    await recordAudit(pool, ctx, req, {
      source: 'qc-sessions-api',
      action: AUDIT_ACTION.QC_SESSION_END,
      entityType: AUDIT_ENTITY.QC_SESSION,
      entityId: sessionId,
      method: 'manual',
      after: { ...result.session },
    });
  }
  return NextResponse.json({ data });
}
