/** GET /api/kiosk/repair/ticket-candidates?query= — existing helpdesk tickets a counter drop-off can be attached to. */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { HELPDESK_NOT_CONNECTED_MESSAGE } from '@/lib/integrations/helpdesk';
// ONE predicate for "no helpdesk capability", shared with every staff route
// that maps this error — not a second `instanceof` pair that can drift from
// the ZendeskNotConfigured / HelpdeskNotConnected pair it has to cover.
import { isHelpdeskNotConnected } from '@/lib/support/ticket-link';
import { listTicketLinkCandidates } from '@/lib/zendesk-link-candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The anchor id for a repair that has not been written yet. */
const UNSAVED_REPAIR_ENTITY_ID = 0;

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const query = req.nextUrl.searchParams.get('query');
  try {
    const { tickets, hiddenLinked } = await listTicketLinkCandidates({
      orgId: ctx.organizationId,
      entityType: 'REPAIR',
      entityId: UNSAVED_REPAIR_ENTITY_ID,
      query,
    });
    return NextResponse.json({ success: true, tickets, hiddenLinked });
  } catch (error: unknown) {
    // A counter tablet must not 5xx on a picker. `success: false` + a sentence
    // is what `useTicketSearch` renders in the list's own error slot, so the
    // step stays usable — the customer can still take the create path.
    const notConnected = isHelpdeskNotConnected(error);
    if (!notConnected) {
      console.warn('kiosk ticket candidates unavailable', error);
    }
    return NextResponse.json({
      success: false,
      error: notConnected
        ? HELPDESK_NOT_CONNECTED_MESSAGE
        : 'Could not reach the helpdesk — file a new ticket instead.',
      tickets: [],
      hiddenLinked: 0,
    });
  }
});
