/**
 * GET /api/kiosk/repair/next-ticket — the support ticket number this intake will most likely get, for the paperwork preview on the review…
 * Operator 2026-09-15: the review step shows the PAPERWORK (not a hand-rolled
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { previewNextSupportTicketId } from '@/lib/support/next-ticket-preview';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withKioskAuth(async (_req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;

  const nextTicketId = await previewNextSupportTicketId({
    newestTicketId: async () => {
      const helpdesk = await getHelpdeskProvider(orgId);
      if (!helpdesk) return null;
      // ONE ticket, sorted by id descending: the highest id in the account is
      // the only fact the projection needs, and a counter tablet should not
      // pull a page of unrelated tickets to learn it.
      const page = await helpdesk.listTickets({ perPage: 1, sortBy: 'id', sortOrder: 'desc' });
      const newest = page.tickets[0];
      return typeof newest?.id === 'number' ? newest.id : null;
    },
    onError: (error) =>
      console.warn('next-ticket preview unavailable; paperwork shows no number', error),
  });

  return NextResponse.json({ nextTicketId });
});
