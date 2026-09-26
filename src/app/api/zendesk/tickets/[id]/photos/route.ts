import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { getEntityPhotos, getTicketEntity } from '@/lib/zendesk-links';

export const dynamic = 'force-dynamic';

/** GET /api/zendesk/tickets/:id/photos */

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

function ticketIdFromUrl(req: NextRequest): number {
  const segs = req.nextUrl.pathname.split('/').filter(Boolean);
  const photosIdx = segs.lastIndexOf('photos');
  const raw = decodeURIComponent(segs[photosIdx - 1] || '').trim();
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('A valid numeric ticket id is required');
  }
  return id;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/tickets/[id]/photos';
    try {
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return notConfigured(context);
      const id = ticketIdFromUrl(req);

      const entity = await getTicketEntity(ctx.organizationId, id);
      if (!entity) {
        return NextResponse.json({ success: true, entity: null, photos: [] });
      }

      const photos = await getEntityPhotos(ctx.organizationId, entity);
      return NextResponse.json({
        success: true,
        entity: { type: entity.type, id: entity.id, source: entity.source },
        photos,
      });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);
