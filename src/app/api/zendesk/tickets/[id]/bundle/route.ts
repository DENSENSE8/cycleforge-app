import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { loadTicketMirror } from '@/lib/support/ticket-mirror';

export const dynamic = 'force-dynamic';

/**
 * GET /api/zendesk/tickets/:id/bundle[?refresh=1] — ticket + full thread +
 * agents + assignment + entity/photos from the local ticket mirror (one DB
 * round trip warm; `refresh=1` re-mirrors live first).
 */

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
  const status = (err as { status?: number })?.status;
  if (status === 404) {
    return errorResponse(new ApiError(404, 'Zendesk ticket not found'), context);
  }
  return errorResponse(err, context);
}

function ticketIdFromUrl(req: NextRequest): number {
  const segs = req.nextUrl.pathname.split('/').filter(Boolean);
  const bundleIdx = segs.lastIndexOf('bundle');
  const raw = decodeURIComponent(segs[bundleIdx - 1] || '').trim();
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('A valid numeric ticket id is required');
  }
  return id;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/tickets/[id]/bundle';
    try {
      const id = ticketIdFromUrl(req);
      const load = await loadTicketMirror(ctx.organizationId, id, {
        refresh: req.nextUrl.searchParams.get('refresh') === '1',
      });
      if (load.status === 'not_configured') return notConfigured(context);
      if (load.status === 'not_found') throw ApiError.notFound('Zendesk ticket', id);
      const { mirror } = load;
      return NextResponse.json({
        success: true,
        ticket: mirror.ticket,
        comments: mirror.comments,
        // The mirror holds the whole thread — never a next page.
        commentsCount: mirror.comments.length,
        commentsNextPage: null,
        agents: mirror.agents,
        assignment: mirror.assignment,
        entity: mirror.entity,
        photos: mirror.photos,
      });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);
