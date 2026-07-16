import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import {
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import {
  isHelpdeskNotConnected,
  linkTicketToAnchor,
  listCandidatesForAnchor,
  unlinkTicketFromAnchor,
} from '@/lib/support/ticket-link';

export const dynamic = 'force-dynamic';

/**
 * Link an EXISTING Zendesk ticket to a receiving carton/line (the counterpart
 * to POST /api/receiving/zendesk-claim, which creates a fresh ticket).
 *
 * Thin wrapper over the universal `/api/support/tickets/link` waist — same
 * candidate search / link / unlink behaviour, gated by receiving.mark_received
 * so floor operators can claim without the broader Zendesk console permission.
 */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

const SearchQuery = z.object({
  query: z.string().trim().optional(),
  receivingId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive().optional(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/receiving/zendesk-claim/link';
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = SearchQuery.parse({
      query: sp.get('query') ?? undefined,
      receivingId: sp.get('receivingId') ?? undefined,
      lineId: sp.get('lineId') ?? undefined,
    });
    const { tickets, hiddenLinked } = await listCandidatesForAnchor({
      orgId: ctx.organizationId,
      anchor: {
        type: 'receiving',
        receivingId: parsed.receivingId,
        lineId: parsed.lineId,
      },
      query: parsed.query,
    });
    return NextResponse.json({ success: true, tickets, hiddenLinked });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'receiving.mark_received' });

const LinkBody = z.object({
  receivingId: z.number().int().positive(),
  lineId: z.number().int().positive().nullable().optional(),
  ticketId: z.number().int().positive(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const context = 'POST /api/receiving/zendesk-claim/link';
  try {
    const body = LinkBody.parse(await req.json().catch(() => null));
    const result = await linkTicketToAnchor({
      orgId: ctx.organizationId,
      ticketId: body.ticketId,
      anchor: {
        type: 'receiving',
        receivingId: body.receivingId,
        lineId: body.lineId,
      },
      staffId: ctx.staffId,
    });
    return NextResponse.json({
      success: true,
      ticketNumber: result.ticketNumber,
      ticketUrl: result.ticketUrl,
      subject: result.subject,
    });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'receiving.mark_received' });

const UnlinkQuery = z.object({
  receivingId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive().optional(),
  ticketId: z.coerce.number().int().positive(),
});

/**
 * DELETE ?receivingId=N[&lineId=N]&ticketId=N — detach a linked ticket from the
 * carton/line. Removes the ticket_links row (entity-scoped) and clears the
 * zendesk_ticket column. The Zendesk ticket itself is never touched.
 */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const context = 'DELETE /api/receiving/zendesk-claim/link';
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = UnlinkQuery.parse({
      receivingId: sp.get('receivingId') ?? undefined,
      lineId: sp.get('lineId') ?? undefined,
      ticketId: sp.get('ticketId') ?? undefined,
    });
    const { removed } = await unlinkTicketFromAnchor({
      orgId: ctx.organizationId,
      ticketId: parsed.ticketId,
      anchor: {
        type: 'receiving',
        receivingId: parsed.receivingId,
        lineId: parsed.lineId,
      },
    });
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'receiving.mark_received' });
