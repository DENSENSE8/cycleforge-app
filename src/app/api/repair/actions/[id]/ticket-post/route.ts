import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { postRepairActionToTicket } from '@/lib/repair/repair-action-ticket-post';

/** POST /api/repair/actions/[id]/ticket-post */
export const POST = withAuth(
  async (req, ctx) => {
    // withAuth doesn't forward Next's route ctx; the id is the segment before `ticket-post`.
    const segments = req.nextUrl.pathname.split('/');
    const id = Number(decodeURIComponent(segments.at(-2) ?? ''));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
    }

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
  },
  { permission: 'repair.mark_repaired' },
);
