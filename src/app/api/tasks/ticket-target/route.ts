import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { resolveTicketTarget } from '@/lib/tasks/resolve-ticket-target';
import { ticketTargetDbDeps } from '@/lib/tasks/ticket-target-deps';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/ticket-target — turn `#48120` into a throwable ticket.
 *
 * The Daily composer's **Ticket** type needs the LOCAL `support_tickets.id`
 * that `POST /api/tasks` anchors on, and an operator only ever has the PROVIDER
 * number. `resolveTicketTarget` owns that translation and its refusals; this
 * handler binds it to Neon and the helpdesk.
 *
 * WHY NOT `/api/support/context?ticket=`
 *   That read answers a different question — the whole linkage loop, the entity
 *   thread and a merged timeline — and is gated on `integrations.zendesk`,
 *   which a floor staffer who can be handed work does not hold. This route is
 *   gated on `work_orders.claim`, the SAME permission as the throw it feeds, so
 *   the composer cannot offer a type the operator is then refused.
 *
 * WHY A POST
 *   A confirmed-but-unmirrored ticket gets its registry row here. That is a
 *   write, so it is not a GET, and it is audited when it happens.
 */

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
