/** POST /api/counter/session/{id}/submit — finish the visit. */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { submitSession } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({ expectedVersion: z.number().int().min(0) });

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const submitted = await submitSession(
      ctx.organizationId as OrgId,
      { kind: 'desk', staffId: ctx.staffId },
      sessionId,
      { expectedVersion: parsed.data.expectedVersion, steppedUpStaffId: ctx.staffId },
    );
    const result = await fanOutCounterSession(ctx.organizationId, submitted);

    if (result.ok) {
      ctx.markAuditWritten();
      await recordAudit(pool, ctx, req, {
        source: 'counter-session',
        action: AUDIT_ACTION.COUNTER_SESSION_SUBMIT,
        entityType: AUDIT_ENTITY.COUNTER_SESSION,
        entityId: sessionId,
        after: {
          counterTransactionId: submitted.outcome?.transaction.counterTransactionId ?? null,
          totalCents: submitted.outcome?.transaction.totalCents ?? null,
          idempotentReplay: submitted.outcome?.transaction.idempotentReplay ?? false,
        },
        method: 'manual',
      });
    }

    if (result.ok && submitted.outcome) {
      return Response.json(
        {
          snapshot: result.snapshot,
          event: result.event,
          transaction: submitted.outcome.transaction,
        },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
    return deskResult(result);
  },
  { permission: 'walk_in.take_payment', stepUp: true },
);
