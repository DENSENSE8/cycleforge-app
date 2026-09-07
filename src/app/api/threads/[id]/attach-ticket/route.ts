import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadAttachTicketBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { attachSupportTicket } from '@/lib/threads/threads';
import { withTenantTransaction } from '@/lib/tenancy/db';

/**
 * POST /api/threads/[id]/attach-ticket — attach an existing support-ticket row
 * to a ticketless thread (D6 seam). Idempotent on the same ticket;
 * 409 when a different ticket is already attached.
 *
 * Tenant scoping: attachSupportTicket runs inside its own tenant transaction
 * (GUC + org conjuncts); the audit write below runs under withTenantTransaction
 * as well, so every statement the route issues is app.current_org-scoped.
 */
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
    const parsed = parseBody(ThreadAttachTicketBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await attachSupportTicket({
      orgId: gate.ctx.organizationId,
      threadId,
      supportTicketId: parsed.supportTicketId,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      await withTenantTransaction(gate.ctx.organizationId, (client) =>
        recordAudit(client, gate.ctx, req, {
          source: 'threads-api',
          action: AUDIT_ACTION.THREAD_TICKET_ATTACH,
          entityType: AUDIT_ENTITY.ENTITY_THREAD,
          entityId: threadId,
          after: { supportTicketId: parsed.supportTicketId },
        }),
      );
    }

    return NextResponse.json({ success: true, thread: result.thread, idempotent: result.idempotent });
  } catch (error: any) {
    console.error('Error in POST /api/threads/[id]/attach-ticket:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
