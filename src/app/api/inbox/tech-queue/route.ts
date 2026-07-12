/**
 * GET /api/inbox/tech-queue — the tech-station inbox backlog for the logged-in
 * staffer. Two buckets, derived live so the bell survives a reload and shows the
 * true backlog (not just whatever was pushed this session):
 *
 *   - return_pending_test : unboxed returns that still have a line needing test.
 *   - order_ready_ship    : unboxed priority cartons (a pending order needs the
 *                           contents) ready to fulfil/ship.
 *
 * Only primary-TECH staff get contents; everyone else gets an empty queue (the
 * client still subscribes to its own inbox channel — the publishers only fan out
 * to primary techs, so non-techs never receive the refetch events anyway).
 * staffId comes from the verified session; no special permission (own-data read).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listTechQueueItemsForStaff } from '@/lib/inbox/tech-queue-items';

export const runtime = 'nodejs';

export const GET = withAuth(async (_req, ctx) => {
  const items = await listTechQueueItemsForStaff(ctx.organizationId, ctx.staffId);
  const returnCount = items.filter((it) => it.kind === 'return_pending_test').length;
  const orderCount = items.filter((it) => it.kind === 'order_ready_ship').length;

  return NextResponse.json({
    items,
    counts: {
      return_pending_test: returnCount,
      order_ready_ship: orderCount,
    },
  });
});
