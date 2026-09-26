import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { fetchAllWorkOrderQueues } from '@/lib/work-orders/fetch-all-queues';
import { topWorkOrderForStaff } from '@/lib/work-orders/ranking';
import { filterAssignedToStaff } from '@/lib/work-orders/deadline-bands';

/** GET /api/work-orders/mine */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const listMode = request.nextUrl.searchParams.get('list') === '1';
    const allRows = await fetchAllWorkOrderQueues(ctx.organizationId, { unified: true });
    const top = topWorkOrderForStaff(allRows, ctx.staffId);

    // Slim projection — the chip only needs to render + deep-link.
    const topPayload = top
      ? {
          id: top.id,
          entityType: top.entityType,
          entityId: top.entityId,
          queueLabel: top.queueLabel,
          title: top.title,
          subtitle: top.subtitle,
          recordLabel: top.recordLabel,
          sourcePath: top.sourcePath,
          status: top.status,
          priority: top.priority,
          deadlineAt: top.deadlineAt,
          role: top.techId === ctx.staffId ? 'tester' : 'packer',
        }
      : null;

    if (listMode) {
      return NextResponse.json({
        top: topPayload,
        rows: filterAssignedToStaff(allRows, ctx.staffId),
      });
    }

    if (!top) {
      return NextResponse.json({ top: null });
    }

    return NextResponse.json({ top: topPayload });
  } catch (error: any) {
    console.error('Failed to fetch operator top work order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top work order', details: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
}, { permission: 'work_orders.view' });
