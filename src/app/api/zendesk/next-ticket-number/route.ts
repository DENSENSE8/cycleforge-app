import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError, listTickets } from '@/lib/zendesk';
import { predictNextTicketNumber } from '@/lib/support/next-ticket-number';
import {
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';

export const dynamic = 'force-dynamic';

/** GET /api/zendesk/next-ticket-number */
export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/next-ticket-number';
    try {
      const page = await listTickets(
        { perPage: 5, sortBy: 'created_at', sortOrder: 'desc' },
        ctx.organizationId,
      );
      const next = predictNextTicketNumber(page.tickets ?? []);
      return NextResponse.json({ success: true, next });
    } catch (err) {
      if (err instanceof ZendeskNotConfiguredError) {
        return errorResponse(
          new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
          context,
        );
      }
      if (err instanceof ZendeskApiError) {
        const status = err.status >= 400 && err.status < 600 ? err.status : 502;
        return errorResponse(new ApiError(status, 'Zendesk API error', err.message), context);
      }
      return errorResponse(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);
