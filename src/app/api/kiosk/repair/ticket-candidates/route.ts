/**
 * GET /api/kiosk/repair/ticket-candidates?query= — existing helpdesk tickets a
 * counter drop-off can be attached to.
 *
 * The device-principal READ sibling of `GET /api/support/tickets/link`, which
 * is `withAuth` + `integrations.zendesk` and therefore 401s on a tablet. Same
 * shape (`{ success, tickets, hiddenLinked }`) because the client hook is the
 * same one every link surface uses (`useTicketSearch`).
 *
 * ## No anchor, because the repair row does not exist yet
 *
 * Every other link surface resolves an anchor first (`listCandidatesForAnchor`
 * → `resolveTicketLinkAnchor`), which needs a persisted entity. At the kiosk
 * the customer is still signing: the `repair_service` row is written when the
 * CART submits, and the attach then happens through the `ATTACH_TICKET` outbox
 * row `submitCounterTransaction` enqueues against the new repair's id. So this
 * route calls the candidate query directly with the unsaved-repair anchor
 * ({@link UNSAVED_REPAIR_ENTITY_ID}) — nothing is linked to id 0, so no
 * candidate can read back as `linkedToThis`, which is the truth: this repair
 * has no ticket yet.
 *
 * `mode: 'anchor'` (the default) is deliberate. A ticket that is already the
 * anchor for something else is HIDDEN rather than offered, because picking it
 * would re-anchor it away from that entity — the same rule the receiving claim
 * link applies, and the reason the response reports `hiddenLinked`.
 *
 * Read-only. `withKioskAuth` scopes it to the paired device's own org; the path
 * is already covered by the `/api/kiosk/repair` entry in
 * `KIOSK_HOST_ALLOWED_PATHS`.
 *
 * Callers: `useKioskTicketSearch` (`KioskTicketStep`).
 * Affected API: none. Schemas: reads `ticket_links` / `unfound_overlay`.
 */

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

/**
 * The anchor id for a repair that has not been written yet. Not a magic
 * number with a wish attached: `ticket_links.entity_id` is a positive
 * identity everywhere, so 0 matches nothing and the `linkedToThis` flag is
 * false for every candidate — which is exactly what an unsaved drop-off
 * should claim.
 */
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
