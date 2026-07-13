import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { loadZendeskTicketBundle } from '@/lib/integrations/helpdesk/load-ticket-bundle';

export const dynamic = 'force-dynamic';

/**
 * GET /api/zendesk/tickets/:id/bundle
 *
 * One round-trip for the support detail panel: ticket, enriched comments,
 * agents, in-website assignment, and linked entity photos. Responses are
 * Redis-cached (90s) per org+ticket; mutations invalidate the cache tag.
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
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return notConfigured(context);
      const id = ticketIdFromUrl(req);
      const bypassCache = req.nextUrl.searchParams.get('refresh') === '1';
      const bundle = await loadZendeskTicketBundle(ctx.organizationId, id, helpdesk, {
        bypassCache,
      });
      return NextResponse.json({ success: true, ...bundle });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);
