import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { isHelpdeskNotConnected } from '@/lib/support/ticket-link';
import { resolveTicketLinkQueryKind } from '@/lib/support/ticket-link-query';
import { getTicket, listTickets, searchTickets, type ZendeskTicket } from '@/lib/zendesk';

export const runtime = 'nodejs';

/**
 * GET /api/daily-checks/ticket-candidates?query= — anchor-free ticket lookup for
 * the Daily chip slider.
 *
 * Exists because the universal link waist (`/api/support/tickets/link`) REQUIRES
 * an entity anchor (receiving / tracking / shipment / order) before it will
 * answer. A daily-check item is not in that union and must not be forced into
 * it — widening the anchor enum to satisfy a read-only picker would let a
 * checklist row re-anchor a ticket on POST. So this route reads candidates and
 * nothing else: no link rows, no hidden-linked accounting, no audit.
 *
 * Query classification is the SHARED {@link resolveTicketLinkQueryKind}, not a
 * local regex: a 12-digit FedEx number pasted into the phone filter must reach
 * searchTickets, never getTicket(trackingDigits).
 *
 * Helpdesk not connected answers `200 { tickets: [], notConfigured: true }`
 * rather than the desk surfaces' 503. On a phone the picker is one control
 * inside a checklist sheet; a 503 there paints a red failure the operator has no
 * way to act on, so the absence of a helpdesk is reported as a quiet fact.
 *
 * Payload is `{ id, subject, status }` only — this feeds a chip, not a console.
 */

const PER_PAGE = 20;

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/daily-checks/ticket-candidates';
    try {
      const queryKind = resolveTicketLinkQueryKind(req.nextUrl.searchParams.get('query') ?? '');

      let tickets: ZendeskTicket[];
      if (queryKind.kind === 'recent') {
        tickets = (await listTickets({ perPage: PER_PAGE }, ctx.organizationId)).tickets;
      } else if (queryKind.kind === 'id') {
        const ticket = await getTicket(queryKind.ticketId, ctx.organizationId);
        tickets = ticket ? [ticket] : [];
      } else {
        tickets = (await searchTickets(queryKind.query, { perPage: PER_PAGE }, ctx.organizationId))
          .results;
      }

      return NextResponse.json({
        tickets: tickets.map((ticket) => ({
          id: ticket.id,
          subject: ticket.subject ?? null,
          status: String(ticket.status),
        })),
      });
    } catch (err) {
      if (isHelpdeskNotConnected(err)) {
        return NextResponse.json({ tickets: [], notConfigured: true });
      }
      return errorResponse(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);
