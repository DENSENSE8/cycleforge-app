/** GET /api/inbox/tech-queue — the tech-station inbox backlog for the logged-in staffer. */

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
