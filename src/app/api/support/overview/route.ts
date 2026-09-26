import { NextResponse } from 'next/server';
import {
  getHelpdeskProvider,
  HELPDESK_NOT_CONNECTED_MESSAGE,
  type HelpdeskOverview,
} from '@/lib/integrations/helpdesk';
import { getOrSetZendeskOverview } from '@/lib/integrations/helpdesk/zendesk-ticket-cache';
import { formatPSTTimestamp } from '@/utils/date';
import { withAuth } from '@/lib/auth/withAuth';

export const dynamic = 'force-dynamic';

/** Support overview — the org's helpdesk (Zendesk is the first adapter; eBay messages/returns were removed when the support surface became… */
export const GET = withAuth(async (_req, ctx) => {
  const helpdesk = await getHelpdeskProvider(ctx.organizationId);
  const zendesk: HelpdeskOverview = helpdesk
    ? await getOrSetZendeskOverview(ctx.organizationId, 10, () => helpdesk.getOverview(10))
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
}, { feature: 'support' });
