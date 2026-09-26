import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { isHelpdeskNotConnected } from '@/lib/support/ticket-link';
import { resolveTicketLinkQueryKind } from '@/lib/support/ticket-link-query';
import { getTicket, listTickets, searchTickets, type ZendeskTicket } from '@/lib/zendesk';

export const runtime = 'nodejs';

/** GET /api/daily-checks/ticket-candidates?query= — anchor-free ticket lookup for the Daily chip slider. */

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
