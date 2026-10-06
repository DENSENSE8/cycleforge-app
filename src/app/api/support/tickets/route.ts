import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { readIdempotencyKey } from '@/lib/api-idempotency';
import { createSupportTicket, providerTicketContent } from '@/lib/support/create-ticket';
import { SupportTicketCreateBody } from '@/lib/schemas/support-tickets';
import { isHelpdeskNotConnected } from '@/lib/support/ticket-link';
import { notifyTicketMentions, resolveTicketMentionRecipients } from '@/lib/support/ticket-mentions';
import { connectedProviderKey } from '@/lib/integrations/capability-connections';
import { noteMentionsToPlain } from '@/lib/orders/note-mentions';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support/tickets — station-generic ticket create. `@[Name](staff:ID)` tokens in `note` reach the helpdesk as `@Name` and ring those staff here.
 * `test: true` runs the same validation, payload and mention resolution but creates nothing: no helpdesk call, no rows, no inbox rings, no audit.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = SupportTicketCreateBody.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }

    const note = parsed.data.note ?? null;
    if (parsed.data.test) {
      const [helpdesk, wouldMention] = await Promise.all([
        connectedProviderKey(ctx.organizationId, 'helpdesk'),
        note ? resolveTicketMentionRecipients({ orgId: ctx.organizationId, note, actorStaffId: ctx.staffId ?? null }) : [],
      ]);
      return NextResponse.json({
        success: true,
        test: true,
        helpdesk,
        wouldSend: providerTicketContent(parsed.data.subject, note ? noteMentionsToPlain(note) : null),
        wouldMention,
      });
    }

    const result = await createSupportTicket({
      orgId: ctx.organizationId,
      subject: parsed.data.subject,
      note: note ? noteMentionsToPlain(note) : null,
      anchor: parsed.data.anchor ?? null,
      linkages: parsed.data.linkages ?? null,
      staffId: ctx.staffId ?? null,
      idempotencyKey: readIdempotencyKey(req),
    });

    await recordAudit(pool, ctx, req, {
      source: 'support-api',
      action: AUDIT_ACTION.SUPPORT_TICKET_CREATE,
      entityType: AUDIT_ENTITY.SUPPORT_TICKET,
      entityId: result.supportTicketId,
      after: {
        providerTicketId: result.providerTicketId,
        linkedEntityType: result.linkedEntityType,
        linkedEntityId: result.linkedEntityId,
      },
    });

    // The ticket exists at the helpdesk by now — a failed ring must not turn it into a 500 the operator would retry into a duplicate.
    const mentionedStaffIds = note
      ? await notifyTicketMentions({
          orgId: ctx.organizationId,
          supportTicketId: result.supportTicketId,
          providerTicketId: result.providerTicketId,
          note,
          actorStaffId: ctx.staffId ?? null,
        }).catch((err) => {
          console.error('[POST /api/support/tickets] mention fan-out failed', err);
          return [] as number[];
        })
      : [];

    return NextResponse.json({ success: true, ...result, mentionedStaffIds });
  } catch (err) {
    // A disconnected helpdesk is operator-actionable, not a server error.
    if (isHelpdeskNotConnected(err)) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Helpdesk not connected' },
        { status: 409 },
      );
    }
    return errorResponse(err, 'POST /api/support/tickets');
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
