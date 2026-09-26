import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadEscalateBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { escalateThreadToTicket } from '@/lib/threads/escalate';
import { HelpdeskNotConnectedError } from '@/lib/integrations/helpdesk';
import { withIdempotencyClaim, readIdempotencyKey } from '@/lib/api-idempotency';
import pool from '@/lib/db';

/** POST /api/threads/[id]/escalate — turn a ticketless thread into a support ticket and attach it (D6). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = Number(rawId);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(ThreadEscalateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    // Escalation creates a ticket (an external Zendesk one in 'zendesk' mode), so a double-fire / retry must NOT mint two tickets.
    const idempotencyKey = readIdempotencyKey(req) ?? `escalate:thread:${threadId}`;
    const claimed = await withIdempotencyClaim(
      pool,
      {
        orgId: gate.ctx.organizationId,
        idempotencyKey,
        route: 'threads.escalate',
        staffId: gate.ctx.user?.staffId ?? null,
      },
      async (): Promise<{ status: number; body: Record<string, unknown> }> => {
        const result = await escalateThreadToTicket({
          orgId: gate.ctx.organizationId,
          threadId,
          mode: parsed.mode,
          subject: parsed.subject ?? null,
          note: parsed.note ?? null,
          staffId: gate.ctx.user?.staffId ?? null,
        });
        if (!result.ok) {
          return { status: result.status, body: { success: false, error: result.error } };
        }

        // Audit only a real escalation (a fresh ticket was created + attached),
        // never the idempotent replay of an already-linked thread.
        if (result.created) {
          await recordAudit(pool, gate.ctx, req, {
            source: 'threads-api',
            action: AUDIT_ACTION.THREAD_TICKET_ATTACH,
            entityType: AUDIT_ENTITY.ENTITY_THREAD,
            entityId: threadId,
            after: { supportTicketId: result.supportTicketId, mode: parsed.mode },
          });
        }

        return {
          status: 200,
          body: {
            success: true,
            thread: result.thread,
            supportTicketId: result.supportTicketId,
            created: result.created,
          },
        };
      },
    );

    return NextResponse.json(claimed.body, { status: claimed.status });
  } catch (error: any) {
    // Helpdesk not connected is an operator-actionable 409, not a 500.
    if (error instanceof HelpdeskNotConnectedError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error('Error in POST /api/threads/[id]/escalate:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
