import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { resolveTicketTarget } from '@/lib/tasks/resolve-ticket-target';
import { ticketTargetDbDeps } from '@/lib/tasks/ticket-target-deps';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/ticket-target — turn `#48120` into a throwable ticket. */

const BodySchema = z.object({
  /** `#48120` or `48120`. Parsed by `parseTicketScanValue`, never here. */
  ticket: z.string().trim().min(1).max(32),
});

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<string, number> = {
  invalid_number: 400,
  not_found: 404,
  helpdesk_unavailable: 503,
};

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const json = await req.json().catch(() => null);
      const parsed = BodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const result = await resolveTicketTarget(
        parsed.data.ticket,
        ticketTargetDbDeps(ctx.organizationId, ctx.staffId ?? null),
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.reason },
          { status: REFUSAL_STATUS[result.reason] ?? 400 },
        );
      }

      if (result.registered) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.SUPPORT_TICKET_REGISTER,
          entityType: AUDIT_ENTITY.SUPPORT_TICKET,
          entityId: result.supportTicketId,
          after: { providerTicketId: result.providerTicketId, reason: 'task_target' },
        });
      }

      return NextResponse.json({ success: true, target: result.target });
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/ticket-target');
    }
  },
  { permission: 'work_orders.claim' },
);
