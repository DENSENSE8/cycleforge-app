import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  HelpdeskNotConnectedError,
  requireHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { markdownToHtml } from '@/lib/support/markdown';
import { getTicketEntity } from '@/lib/zendesk-links';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';

export const dynamic = 'force-dynamic';

/**
 * Read-time view of a receiving claim's Zendesk thread, gated on the receiving
 * permission (the generic /api/zendesk/* routes need integrations.zendesk,
 * which a receiving operator may not hold). Powers the ticket-chip history
 * popover.
 *
 *   GET ?ticketId=N → { ticket, comments } for a ticket linked to one of THIS
 *       org's receiving cartons/lines. Tickets not linked to a receiving entity
 *       are refused so this can't be used to read arbitrary Zendesk tickets.
 */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

function mapZendeskError(err: unknown, context: string): NextResponse {
  if (err instanceof ZendeskNotConfiguredError || err instanceof HelpdeskNotConnectedError) {
    return notConfigured(context);
  }
  if (err instanceof ZendeskApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return errorResponse(new ApiError(status, 'Zendesk API error', err.message), context);
  }
  return errorResponse(err, context);
}

/** Best-effort requester email from via.from, falling back to getUsers. */
async function resolveRequesterEmail(
  ticket: {
    requester_id?: number;
    via?: { source?: { from?: { address?: string } } };
  },
  getUsers: (ids: number[]) => Promise<Array<{ id: number; email: string | null }>>,
): Promise<string | null> {
  const viaEmail = ticket.via?.source?.from?.address?.trim() || null;
  if (viaEmail) return viaEmail;
  const requesterId = ticket.requester_id;
  if (!requesterId) return null;
  const users = await getUsers([requesterId]);
  return users[0]?.email?.trim() || null;
}

const Query = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/receiving/zendesk-claim/thread';
  try {
    const { ticketId } = Query.parse({ ticketId: req.nextUrl.searchParams.get('ticketId') ?? undefined });

    // Only expose tickets linked to one of this org's receiving entities — the
    // popover is a receiving surface, not a general Zendesk reader.
    const entity = await getTicketEntity(ctx.organizationId, ticketId);
    if (!entity || (entity.type !== 'RECEIVING' && entity.type !== 'RECEIVING_LINE')) {
      throw ApiError.notFound('Linked receiving ticket', ticketId);
    }

    const helpdesk = await requireHelpdeskProvider(ctx.organizationId);
    const ticket = await helpdesk.getTicket(ticketId);
    if (!ticket) throw ApiError.notFound('Helpdesk ticket', ticketId);
    const [{ comments }, requesterEmail] = await Promise.all([
      helpdesk.listComments(ticketId, { perPage: 100 }),
      resolveRequesterEmail(ticket, (ids) => helpdesk.getUsers(ids)),
    ]);

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        subject: ticket.subject ?? null,
        status: String(ticket.status ?? ''),
        priority: ticket.priority ? String(ticket.priority) : null,
        url: zendeskTicketUrl(ticket.id),
        requesterEmail,
      },
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        public: c.public,
        createdAt: c.created_at,
        authorId: c.author_id,
      })),
    });
  } catch (err) {
    return mapZendeskError(err, context);
  }
}, { permission: 'receiving.mark_received' });

const PostBody = z.object({
  ticketId: z.number().int().positive(),
  body: z.string().trim().min(1).max(20000),
  /**
   * false (default) → internal note, not emailed to anyone.
   * true            → public reply, which Zendesk emails to the requester
   *                   (the customer on the case).
   */
  public: z.boolean().optional().default(false),
  /** CC emails — only applied on public replies. */
  emailCcs: z.array(z.string().trim().email()).max(50).optional(),
});

/**
 * POST → add a reply to a receiving claim's Zendesk ticket. The default is an
 * internal note (`public: false`); a public reply (`public: true`) emails the
 * customer. Same entity-link guard as the GET so this can only post to tickets
 * linked to one of THIS org's receiving cartons/lines.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const context = 'POST /api/receiving/zendesk-claim/thread';
  try {
    const parsed = PostBody.parse(await req.json().catch(() => null));

    const entity = await getTicketEntity(ctx.organizationId, parsed.ticketId);
    if (!entity || (entity.type !== 'RECEIVING' && entity.type !== 'RECEIVING_LINE')) {
      throw ApiError.notFound('Linked receiving ticket', parsed.ticketId);
    }

    const helpdesk = await requireHelpdeskProvider(ctx.organizationId);
    const emailCcs =
      parsed.public && parsed.emailCcs?.length
        ? parsed.emailCcs.map((user_email) => ({ user_email, action: 'put' as const }))
        : undefined;
    const ticket = await helpdesk.addComment(
      parsed.ticketId,
      {
        body: parsed.body,
        html_body: markdownToHtml(parsed.body),
        public: parsed.public,
      },
      emailCcs ? { emailCcs } : undefined,
    );
    if (!ticket) throw ApiError.notFound('Helpdesk ticket', parsed.ticketId);

    return NextResponse.json({
      success: true,
      public: parsed.public,
      ticket: { id: ticket.id, status: String(ticket.status ?? ''), url: zendeskTicketUrl(ticket.id) },
    });
  } catch (err) {
    return mapZendeskError(err, context);
  }
}, { permission: 'receiving.mark_received' });
