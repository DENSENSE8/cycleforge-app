import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { aggregateMyDayFeed } from '@/lib/my-day/aggregate-my-day';

export const runtime = 'nodejs';

/**
 * @deprecated Use GET /api/my-day. Kept for legacy TaskInbox clients.
 */
export const GET = withAuth(async (_req, ctx) => {
  const feed = await aggregateMyDayFeed({
    organizationId: ctx.organizationId,
    staffId: ctx.staffId,
    permissions: ctx.permissions,
  });

  const items = [
    ...(feed.doNext
      ? [{
          id: feed.doNext.id,
          kind: 'work_order',
          title: feed.doNext.title,
          subtitle: feed.doNext.subtitle,
          status: 'assigned',
          domain: feed.doNext.queueLabel,
          createdAt: Date.now(),
        }]
      : []),
    ...feed.assigned.map((row) => ({
      id: row.id,
      kind: 'work_order',
      title: row.title,
      subtitle: row.subtitle,
      status: 'assigned',
      domain: row.queueLabel,
      createdAt: Date.now(),
    })),
    ...feed.interrupts.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      status: 'assigned',
      domain: item.kind,
      createdAt: item.createdAtMs,
    })),
  ];

  return NextResponse.json({ items });
});

export const POST = withAuth(async () => {
  return NextResponse.json({ error: 'Use PATCH /api/work-orders to claim assignments' }, { status: 410 });
});