import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tenantQuery } from '@/lib/tenancy/db';
import { upsertSupportTicket } from '@/lib/support/tickets';
import { getTicket } from '@/lib/zendesk';
import {
  resolveTicketTarget,
  type RegisteredTicket,
  type TicketTargetDeps,
} from '@/lib/tasks/resolve-ticket-target';

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

      const deps: TicketTargetDeps = {
        async findRegistered(providerTicketId) {
          const res = await tenantQuery<{
            id: string;
            external_ticket_id: string | null;
            subject_cache: string | null;
            status_cache: string | null;
          }>(
            ctx.organizationId,
            `SELECT id, external_ticket_id, subject_cache, status_cache
               FROM support_tickets
              WHERE organization_id = $1
                AND provider = 'zendesk'
                AND external_ticket_id = $2
              LIMIT 1`,
            [ctx.organizationId, String(providerTicketId)],
          );
          const row = res.rows[0];
          if (!row) return null;
          return {
            id: Number(row.id),
            providerTicketId,
            subject: row.subject_cache,
            status: row.status_cache,
          } satisfies RegisteredTicket;
        },

        async fetchProviderTicket(providerTicketId) {
          const ticket = await getTicket(providerTicketId, ctx.organizationId);
          if (!ticket) return null;
          return { subject: ticket.subject ?? null, status: ticket.status ?? null };
        },

        async register({ providerTicketId, subject, status }) {
          const row = await upsertSupportTicket({
            orgId: ctx.organizationId,
            provider: 'zendesk',
            externalTicketId: String(providerTicketId),
            subjectCache: subject,
            statusCache: status,
            staffId: ctx.staffId ?? null,
          });
          return {
            id: row.id,
            providerTicketId,
            subject: row.subjectCache,
            status: row.statusCache,
          } satisfies RegisteredTicket;
        },
      };

      const result = await resolveTicketTarget(parsed.data.ticket, deps);
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
