/** POST /api/receiving/[id]/claims/resolve `{ ticket }` — the carton's claim is settled: its open claim reasons for that ticket close (the ticket stays linked). */

import { NextRequest, NextResponse, after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveCartonClaim } from '@/lib/receiving/exceptions';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const receivingId = Number(segments[segments.indexOf('receiving') + 1]);
    if (!Number.isSafeInteger(receivingId) || receivingId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid receiving id' }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as { ticket?: unknown } | null;
    const ticket = typeof body?.ticket === 'string' ? body.ticket.trim() : '';
    if (!ticket) {
      return NextResponse.json({ success: false, error: 'ticket is required' }, { status: 400 });
    }

    const resolved = await resolveCartonClaim(ctx.organizationId, {
      receivingId,
      ticketNumber: ticket,
      resolvedBy: Number.isSafeInteger(ctx.staffId) && ctx.staffId > 0 ? ctx.staffId : null,
    });
    if (resolved === 0) {
      return NextResponse.json({ success: false, error: 'No open claim for that ticket on this carton' }, { status: 404 });
    }

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingId),
          source: 'receiving.claims.resolve',
        });
      } catch (err) {
        console.warn('claims/resolve: cache/realtime update failed', err);
      }
    });

    return NextResponse.json({ success: true, resolved });
  },
  { permission: 'receiving.mark_received' },
);
