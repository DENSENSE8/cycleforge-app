import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { qcSessionStartBodySchema, qcSessionsQuerySchema } from '@/lib/qc/contracts';
import { listUnitQcSessions, startQcSession } from '@/lib/qc/sessions';

/** GET /api/qc/sessions?unitId= — every bench session on the unit (newest first), the caller's open one, the server clock. */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const query = parseBody(qcSessionsQuerySchema, Object.fromEntries(req.nextUrl.searchParams));
    if (query instanceof NextResponse) return query;
    return NextResponse.json({ data: await listUnitQcSessions(ctx.organizationId, ctx.staffId, query.unitId) });
  },
  { permission: 'tech.view' },
);

/** POST /api/qc/sessions — start (or reuse) the caller's TEST / REPAIR session on a unit. */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const body = parseBody(qcSessionStartBodySchema, await req.json().catch(() => ({})));
    if (body instanceof NextResponse) return body;

    const result = await startQcSession(ctx.organizationId, ctx.staffId, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { ok: _ok, ...data } = result;

    if (result.changed) {
      await recordAudit(pool, ctx, req, {
        source: 'qc-sessions-api',
        action: AUDIT_ACTION.QC_SESSION_START,
        entityType: AUDIT_ENTITY.QC_SESSION,
        entityId: result.session.id,
        method: 'manual',
        after: { ...result.session },
      });
    }
    return NextResponse.json({ data }, { status: result.changed ? 201 : 200 });
  },
  { permission: 'tech.qc_pass' },
);
