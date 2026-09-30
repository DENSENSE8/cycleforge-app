import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { loadTicketMirror } from '@/lib/support/ticket-mirror';
import { pageMirrorComments } from '@/lib/support/ticket-mirror-core';
import { invalidateZendeskOverviewCache } from '@/lib/integrations/helpdesk/zendesk-ticket-cache';

export const dynamic = 'force-dynamic';

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

function mapZendeskError(err: unknown, context: string): NextResponse {
  if (err instanceof ZendeskNotConfiguredError) return notConfigured(context);
  if (err instanceof ZendeskApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return errorResponse(new ApiError(status, 'Zendesk API error', err.message), context);
  }
  return errorResponse(err, context);
}

/** Parse the ticket id from /api/zendesk/tickets/:id/comments. */
function ticketIdFromUrl(req: NextRequest): number {
  const segs = req.nextUrl.pathname.split('/').filter(Boolean);
  const commentsIdx = segs.lastIndexOf('comments');
  const raw = decodeURIComponent(segs[commentsIdx - 1] || '').trim();
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('A valid numeric ticket id is required');
  }
  return id;
}

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET — the thread from the local ticket mirror (whole thread unless page/perPage). */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/tickets/[id]/comments';
    try {
      const id = ticketIdFromUrl(req);
      const sp = req.nextUrl.searchParams;
      const { page, perPage } = ListQuery.parse({
        page: sp.get('page') ?? undefined,
        perPage: sp.get('perPage') ?? sp.get('per_page') ?? undefined,
      });
      const load = await loadTicketMirror(ctx.organizationId, id);
      if (load.status === 'not_configured') return notConfigured(context);
      if (load.status === 'not_found') throw ApiError.notFound('Zendesk ticket', id);
      return NextResponse.json({
        success: true,
        ...pageMirrorComments(load.mirror.comments, { ticketId: id, page, perPage }),
      });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);

const CommentBody = z.object({
  body: z.string().trim().min(1, 'body is required'),
  html_body: z.string().optional(),
  public: z.boolean().optional(),
  /** CC collaborator emails — added to the ticket alongside a public reply. */
  email_ccs: z.array(z.string().trim().email()).max(50).optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'POST /api/zendesk/tickets/[id]/comments';
    try {
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return notConfigured(context);
      const id = ticketIdFromUrl(req);
      const json = await req.json().catch(() => null);
      if (!json) throw ApiError.badRequest('Missing JSON body');
      const input = CommentBody.parse(json);

      const ticket = await helpdesk.addComment(
        id,
        { body: input.body, html_body: input.html_body, public: input.public },
        { emailCcs: input.email_ccs?.map((user_email) => ({ user_email, action: 'put' as const })) },
      );
      if (!ticket) throw ApiError.notFound('Zendesk ticket', id);
      await invalidateZendeskOverviewCache(ctx.organizationId);
      return NextResponse.json({ success: true, ticket }, { status: 201 });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  {
    permission: 'integrations.zendesk',
    feature: 'support',
    audit: {
      source: 'api',
      action: 'zendesk.ticket.comment',
      entityType: 'zendesk_ticket',
      entityId: ({ response }) =>
        (response as { ticket?: { id?: number } } | null)?.ticket?.id ?? null,
    },
  },
);
