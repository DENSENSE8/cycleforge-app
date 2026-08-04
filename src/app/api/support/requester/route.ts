import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { resolveRequesterProfile } from '@/lib/support/requester-profile';
import { requesterProfileDeps } from '@/lib/support/requester-profile-deps';
import { requesterFrom } from '@/components/support/zendesk/chat/support-chat-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/support/requester?ticketId=<provider ticket id>
 *
 * Who opened this ticket, and what we already know about them — the head band
 * of the ticket thread. Read-only; not a mutation, so no audit row.
 *
 * The requester identity is read off the ticket itself (`requesterFrom` — the
 * email channel carries it on `via.source.from`), then
 * {@link resolveRequesterProfile} resolves our own customer row and the two
 * counts. Every fact degrades to `null` independently; there is deliberately no
 * LTV and no return rate (see that module's docblock).
 */

const Query = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/support/requester';
  try {
    const { ticketId } = Query.parse({
      ticketId: req.nextUrl.searchParams.get('ticketId') ?? undefined,
    });

    const provider = await getHelpdeskProvider(ctx.organizationId);
    const ticket = provider ? await provider.getTicket(ticketId).catch(() => null) : null;

    // `requesterFrom` reads `via.source.from`, which only the EMAIL channel
    // populates — on a web-form or API ticket it is empty, and the band's
    // headline fact would render `—` on the majority of tickets. The user
    // roster is the authoritative identity, so fall through to it whenever the
    // ticket itself did not carry one.
    let identity = ticket ? requesterFrom(ticket) : { name: null, email: null };
    if (provider && ticket?.requester_id && !identity.email) {
      const [user] = await provider.getUsers([ticket.requester_id]).catch(() => []);
      if (user) {
        identity = { name: identity.name ?? user.name ?? null, email: user.email ?? null };
      }
    }

    const profile = await resolveRequesterProfile(
      ctx.organizationId,
      identity,
      requesterProfileDeps,
    );
    return NextResponse.json({ success: true, profile });
  } catch (err) {
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
