import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

/** GET /api/workflow/flow-audit?days=90 */
export const dynamic = 'force-dynamic';

interface FlowNode {
  status: string;
  count: number;
}
interface FlowEdge {
  from: string;
  to: string;
  count: number;
  lastAt: string | null;
}

export const GET = withAuth(
  async (request, ctx) => {
    const orgId = ctx.organizationId;
    const daysRaw = Number(request.nextUrl.searchParams.get('days'));
    const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? Math.floor(daysRaw) : 90;

    // Live occupancy per lifecycle state.
    const nodesQ = await tenantQuery<{ status: string; count: number }>(
      orgId,
      `SELECT current_status::text AS status, COUNT(*)::int AS count
           FROM serial_units
          WHERE organization_id = $1
          GROUP BY current_status
          ORDER BY count DESC`,
      [orgId],
    );

    // Observed transitions within the window (the actual movements).
    const edgesQ = await tenantQuery<{
      from: string;
      to: string;
      count: number;
      lastAt: string | null;
    }>(
      orgId,
      `SELECT prev_status AS "from",
                next_status AS "to",
                COUNT(*)::int AS count,
                MAX(occurred_at) AS "lastAt"
           FROM inventory_events
          WHERE prev_status IS NOT NULL
            AND next_status IS NOT NULL
            AND prev_status <> next_status
            AND organization_id = $2
            AND occurred_at > NOW() - ($1 || ' days')::interval
          GROUP BY prev_status, next_status
          ORDER BY count DESC`,
      [days, orgId],
    );

    // Event-type volume in the window — a coarse "where is the activity" read.
    const eventsQ = await tenantQuery<{ eventType: string; count: number }>(
      orgId,
      `SELECT event_type AS "eventType", COUNT(*)::int AS count
           FROM inventory_events
          WHERE organization_id = $2
            AND occurred_at > NOW() - ($1 || ' days')::interval
          GROUP BY event_type
          ORDER BY count DESC`,
      [days, orgId],
    );

    const nodes: FlowNode[] = nodesQ.rows;
    const edges: FlowEdge[] = edgesQ.rows.map((e) => ({
      from: e.from,
      to: e.to,
      count: e.count,
      lastAt: e.lastAt ? new Date(e.lastAt).toISOString() : null,
    }));

    const totalUnits = nodes.reduce((sum, n) => sum + n.count, 0);
    const totalTransitions = edges.reduce((sum, e) => sum + e.count, 0);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      windowDays: days,
      nodes,
      edges,
      eventVolume: eventsQ.rows,
      totals: { units: totalUnits, transitions: totalTransitions },
    });
  },
  { permission: 'admin.view' },
);
