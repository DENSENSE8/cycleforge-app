import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import {
  clearTicketAssignment,
  getTicketAssignment,
  upsertTicketAssignment,
} from '@/lib/zendesk-assignments';
import { createStaffMessage, resolveRecipient } from '@/lib/neon/staff-messages-queries';
import { publishStaffMessage } from '@/lib/realtime/publish';
import { invalidateZendeskTicketCache } from '@/lib/integrations/helpdesk/zendesk-ticket-cache';
import { syncZendeskTicketRegistryCaches } from '@/lib/support/tickets';

export const dynamic = 'force-dynamic';

/**
 * In-website staff assignment of a Zendesk ticket (separate from the Zendesk
 * assignee). Assigning drops a notification into the staffer's inbox bell so they
 * follow up; it does NOT change anything in Zendesk.
 *
 * Home Today "Watch ticket" (Add CTA) is self-assign — same table, same route.
 * On assign we always refresh `support_tickets` caches from live Zendesk so
 * Today has a subject and the ticket-watch cron has a baseline.
 *
 *   GET  /api/zendesk/tickets/:id/assign           → { assignment | null }
 *   POST /api/zendesk/tickets/:id/assign { staffId } → assign (null clears)
 */

/** Parse the ticket id from /api/zendesk/tickets/:id/assign. */
function ticketIdFromUrl(req: NextRequest): number {
  const segs = req.nextUrl.pathname.split('/').filter(Boolean);
  const assignIdx = segs.lastIndexOf('assign');
  const raw = decodeURIComponent(segs[assignIdx - 1] || '').trim();
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('A valid numeric ticket id is required');
  }
  return id;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/tickets/[id]/assign';
    try {
      const id = ticketIdFromUrl(req);
      const assignment = await getTicketAssignment(ctx.organizationId, id);
      return NextResponse.json({ success: true, assignment });
    } catch (err) {
      return errorResponse(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);

const AssignBody = z.object({
  staffId: z.number().int().positive().nullable(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'POST /api/zendesk/tickets/[id]/assign';
    try {
      const id = ticketIdFromUrl(req);
      const json = await req.json().catch(() => null);
      if (!json) throw ApiError.badRequest('Missing JSON body');
      const { staffId } = AssignBody.parse(json);

      // Clear the assignment (stop watching).
      if (staffId == null) {
        await clearTicketAssignment(ctx.organizationId, id);
        await invalidateZendeskTicketCache(ctx.organizationId, id);
        return NextResponse.json({ success: true, assignment: null });
      }

      // The recipient must be a live staffer in this org — never trust the body.
      const recipient = await resolveRecipient(ctx.organizationId, staffId);
      if (!recipient) throw ApiError.notFound('Staff member', staffId);

      // Live pull → registry baseline (subject/status for Today + poller).
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      let subject: string | null = null;
      if (helpdesk && (await helpdesk.isConfigured())) {
        const ticket = await helpdesk.getTicket(id).catch(() => null);
        if (!ticket) throw ApiError.notFound('Ticket', id);
        subject = ticket.subject?.trim() || null;
        await syncZendeskTicketRegistryCaches({
          orgId: ctx.organizationId,
          zendeskTicketId: id,
          subject,
          status: ticket.status ? String(ticket.status) : null,
          staffId: ctx.staffId,
        });
      } else {
        // Helpdesk offline — still create a registry stub so Today can list it.
        await syncZendeskTicketRegistryCaches({
          orgId: ctx.organizationId,
          zendeskTicketId: id,
          subject: null,
          status: null,
          staffId: ctx.staffId,
        });
      }

      const assignment = await upsertTicketAssignment({
        organizationId: ctx.organizationId,
        ticketId: id,
        staffId,
        assignedBy: ctx.staffId,
      });

      // Notify the assignee in their inbox bell — unless they assigned it to
      // themselves (self-assign / Watch is not a notification worth raising).
      if (staffId !== ctx.staffId) {
        const body = `Assigned support ticket #${id}${subject ? ` — ${subject}` : ''}`;
        const message = await createStaffMessage({
          organizationId: ctx.organizationId,
          senderId: ctx.staffId,
          recipientId: staffId,
          body,
          kind: 'support_assignment',
          context: { ticketId: id, subject: subject ?? null },
        });
        await publishStaffMessage({
          organizationId: ctx.organizationId,
          recipientId: message.recipientId,
          messageId: message.id,
          senderId: message.senderId,
          senderName: message.senderName,
          body: message.body,
          kind: message.kind,
          context: message.context,
        });
      }

      await invalidateZendeskTicketCache(ctx.organizationId, id);
      return NextResponse.json({ success: true, assignment });
    } catch (err) {
      return errorResponse(err, context);
    }
  },
  {
    permission: 'integrations.zendesk',
    feature: 'support',
    audit: {
      source: 'api',
      action: 'zendesk.ticket.assign',
      entityType: 'zendesk_ticket',
      entityId: ({ req }) => {
        const segs = req.nextUrl.pathname.split('/').filter(Boolean);
        const i = segs.lastIndexOf('assign');
        const n = Number(segs[i - 1]);
        return Number.isInteger(n) ? n : null;
      },
    },
  },
);
