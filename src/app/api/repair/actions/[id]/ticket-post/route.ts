import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { postRepairActionToTicket } from '@/lib/repair/repair-action-ticket-post';

/**
 * POST /api/repair/actions/[id]/ticket-post
 *
 * Retry posting a bench-log entry to its repair's linked helpdesk ticket (the
 * timeline's "Failed — Retry"). Idempotent: an entry already posted, or one
 * whose post is still in flight, is answered 200 with `skipped` and nothing is
 * sent. Same gate as logging the entry.
 */
export const POST = withAuth(
  async (req, ctx) => {
    // withAuth doesn't forward Next's route ctx; the id is the segment before `ticket-post`.
    const segments = req.nextUrl.pathname.split('/');
    const id = Number(decodeURIComponent(segments.at(-2) ?? ''));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
    }

    try {
      const outcome = await postRepairActionToTicket(ctx.organizationId, id);
      switch (outcome.status) {
        case 'posted':
          return NextResponse.json({ success: true, outcome });
        case 'failed':
          return NextResponse.json({ success: false, error: outcome.error, outcome }, { status: 502 });
        case 'skipped':
          if (outcome.reason === 'not-found') {
            return NextResponse.json({ error: 'Action not found' }, { status: 404 });
          }
          if (outcome.reason === 'not-linked') {
            return NextResponse.json(
              { error: 'This repair is not linked to a helpdesk ticket.', outcome },
              { status: 409 },
            );
          }
          return NextResponse.json({ success: true, outcome });
      }
    } catch (error: unknown) {
      console.error('POST /api/repair/actions/[id]/ticket-post error:', error);
      return NextResponse.json(
        { error: 'Failed to post to the ticket', details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  },
  { permission: 'repair.mark_repaired' },
);
