/**
 * GET /api/kiosk/repair/next-ticket — the support ticket number this intake
 * will most likely get, for the paperwork preview on the review step.
 *
 * Operator 2026-09-15: the review step shows the PAPERWORK (not a hand-rolled
 * summary), and *"in the paperwork it shows the preview of the support ticket …
 * it hits the API's Zendesk with the next iteration or the next ticket that
 * will be created."*
 *
 * It is a PROJECTION, not a reservation — Zendesk assigns ids at create time
 * from a sequence shared with every other source in the account. See
 * `src/lib/support/next-ticket-preview.ts` for why that is the only honest
 * answer available, and what the customer is therefore being shown.
 *
 * Read-only and never 5xx: an org with no helpdesk connected, an expired
 * credential or a provider outage all return `{ nextTicketId: null }` and the
 * paperwork shows no number — the same sheet it showed before this route
 * existed. A counter tablet must not be able to fail on a preview.
 *
 * `withKioskAuth` scopes it to the paired device's own org; the path is already
 * covered by the `/api/kiosk/repair` entry in `KIOSK_HOST_ALLOWED_PATHS`.
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
