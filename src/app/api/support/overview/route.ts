import { NextResponse } from 'next/server';
import {
  getHelpdeskProvider,
  HELPDESK_NOT_CONNECTED_MESSAGE,
  type HelpdeskOverview,
} from '@/lib/integrations/helpdesk';
import { formatPSTTimestamp } from '@/utils/date';
import { withAuth } from '@/lib/auth/withAuth';

export const dynamic = 'force-dynamic';

/**
 * Support overview — the org's helpdesk (Zendesk is the first adapter; eBay
 * messages/returns were removed when the support surface became a native
 * ticket console). Powers the Operations dashboard's support tile. Requires a
 * valid session (was previously unauthenticated — the proxy only checks
 * cookie presence). The response key stays `zendesk` for contract stability.
 */
export const GET = withAuth(async (_req, ctx) => {
  try {
    const helpdesk = await getHelpdeskProvider(ctx.organizationId);
    const zendesk: HelpdeskOverview = helpdesk
      ? await helpdesk.getOverview(10)
      : {
          configured: false,
          healthy: false,
          count: 0,
          urgentCount: 0,
          tickets: [],
          agentUrl: null,
          error: HELPDESK_NOT_CONNECTED_MESSAGE,
        };

    const totals = {
      zendeskTickets: zendesk.count,
      attentionItems: zendesk.error ? 1 : 0,
    };

    return NextResponse.json({
      success: true,
      generatedAt: formatPSTTimestamp(),
      totals,
      zendesk,
    });
  } catch (error: any) {
    console.error('Error building support overview:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to load support overview',
      },
      { status: 500 }
    );
  }
}, { feature: 'support' });
