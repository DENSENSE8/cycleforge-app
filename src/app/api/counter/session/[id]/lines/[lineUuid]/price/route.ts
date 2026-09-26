/** POST /api/counter/session/{id}/lines/{lineUuid}/price — override a line price. */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { getSession, updateLine } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, lineUuidFromPath, sessionIdFromPath } from '@/lib/counter/session-http';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  unitAmountCents: z.number().int().min(-10_000_00).max(1_000_000_00),
  reason: z.string().trim().max(200).nullish(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const lineUuid = lineUuidFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || lineUuid === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const orgId = ctx.organizationId as OrgId;
    // Read the BEFORE amount first — an audit row that only carries the new
    // price cannot answer the question anyone actually asks of it later
    // ("what did this cost before someone changed it?").
    const before = await getSession(orgId, sessionId);
    const previous = before?.lines.find((l) => l.id === lineUuid)?.unitAmountCents ?? null;

    const result = await fanOutCounterSession(
      ctx.organizationId,
      await updateLine(orgId, { kind: 'desk', staffId: ctx.staffId }, sessionId, lineUuid, {
        expectedVersion: parsed.data.expectedVersion,
        patch: { unitAmountCents: parsed.data.unitAmountCents },
      }),
    );

    if (result.ok) {
      ctx.markAuditWritten();
      await recordAudit(pool, ctx, req, {
        source: 'counter-session',
        action: AUDIT_ACTION.COUNTER_LINE_PRICE_OVERRIDE,
        entityType: AUDIT_ENTITY.COUNTER_SESSION,
        entityId: sessionId,
        before: { lineUuid, unitAmountCents: previous },
        after: { lineUuid, unitAmountCents: parsed.data.unitAmountCents },
        note: parsed.data.reason ?? null,
        method: 'manual',
      });
    }

    return deskResult(result);
  },
  { permission: 'walk_in.adjust_price', stepUp: true },
);
