import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { listMyRecentTickets, MY_RECENT_TICKETS_MAX_LIMIT } from '@/lib/support/my-recent-tickets';

export const dynamic = 'force-dynamic';

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(MY_RECENT_TICKETS_MAX_LIMIT).optional(),
});

/**
 * GET /api/support/tickets/recent?limit=
 * The signed-in staffer's recently worked helpdesk tickets (replies / notes /
 * openings they posted from this app), newest first — src/lib/support/my-recent-tickets.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/support/tickets/recent';
  try {
    const { limit } = Query.parse({ limit: req.nextUrl.searchParams.get('limit') ?? undefined });
    const tickets = await listMyRecentTickets({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      limit,
    });
    return NextResponse.json({ success: true, tickets });
  } catch (err) {
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
