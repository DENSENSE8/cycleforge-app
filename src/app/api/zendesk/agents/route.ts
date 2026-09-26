import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';

export const dynamic = 'force-dynamic';

/** GET /api/zendesk/agents Lists assignable helpdesk agents + admins for the assignee dropdown (via the org's HelpdeskProvider). */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/agents';
    try {
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return notConfigured(context);
      const force = req.nextUrl.searchParams.get('refresh') === '1';
      const agents = await helpdesk.listAgents(force);
      return NextResponse.json({ success: true, agents });
    } catch (err) {
      if (err instanceof ZendeskNotConfiguredError) return notConfigured(context);
      if (err instanceof ZendeskApiError) {
        const status = err.status >= 400 && err.status < 600 ? err.status : 502;
        return errorResponse(new ApiError(status, 'Zendesk API error', err.message), context);
      }
      return errorResponse(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);
