import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { fetchAllWorkOrderQueues } from '@/lib/work-orders/fetch-all-queues';
import { topWorkOrderForStaff } from '@/lib/work-orders/ranking';
import { filterAssignedToStaff } from '@/lib/work-orders/deadline-bands';

/**
 * GET /api/work-orders/mine
 *
 * The single most important work order for the signed-in operator, feeding the
 * global-header priority chip (P1-WORK-01 acceptance B). Reuses the EXACT queue
 * data source (getOrders) + the shared ranking SoT (topWorkOrderForStaff) so the
 * chip never diverges from the work-orders queue ordering.
 *
 * List mode — `?list=1` → `{ top, rows }`, where `rows` is the FULL set of the
 * staffer's actionable WorkOrderRows (same mine predicate, applied locally via
 * `filterAssignedToStaff` — the shared ranking SoT is untouched). Feeds the
 * mobile `/m/work` queue, which re-bands by deadline client-side (R-FLOW-3).
 * Without the param the response is byte-identical to the original `{ top }`
 * shape — the goal chip (useNextWorkOrder) depends on that.
 *
 * Org/RLS scoped via withAuth's tenantQuery (getOrders takes ctx.organizationId)
 * and operator-scoped via ctx.staffId — only rows the caller owns as tester or
 * packer are considered.
 */
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
