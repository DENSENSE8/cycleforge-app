import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrSet, createCacheLookupKey } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

export const dynamic = 'force-dynamic';

/** Receiving-lines COUNTS sibling (station-table-unification-plan §5 / §7.2). */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const orgId = ctx.organizationId;
  const weekStart = searchParams.get('weekStart') || '';
  const weekEnd = searchParams.get('weekEnd') || '';
  const staffParam = Number(searchParams.get('staff'));
  const staffId = Number.isFinite(staffParam) && staffParam > 0 ? staffParam : null;
  const workflowStatus = (searchParams.get('workflowStatus') || '').trim();

  // 60s-polled receiving-lines day tally. Cached org-scoped, keyed by the
  // filter params; every receiving write busts receiving-lines (org-scoped).
  const payload = await getOrSet(
    CACHE_NS.receivingLinesCounts,
    orgId,
    createCacheLookupKey({ weekStart, weekEnd, staff: staffId ?? '', workflowStatus }),
    CACHE_TTL.rollup,
    [CACHE_TAGS.receivingLines],
    async () => {
      const params: (string | number)[] = [orgId];
      const conditions: string[] = [];
      if (weekStart) {
        params.push(weekStart);
        conditions.push(`rl.created_at >= ($${params.length}::date - INTERVAL '1 day')`);
      }
      if (weekEnd) {
        params.push(weekEnd);
        conditions.push(`rl.created_at < ($${params.length}::date + INTERVAL '2 days')`);
      }
      if (staffId != null) {
        params.push(staffId);
        // assigned_tech_id lives on receiving_line_testing (street cutover).
        conditions.push(
          `EXISTS (SELECT 1 FROM receiving_line_testing rlt
                      WHERE rlt.receiving_line_id = rl.id
                        AND rlt.organization_id = rl.organization_id
                        AND rlt.assigned_tech_id = $${params.length})`,
        );
      }
      if (workflowStatus) {
        params.push(workflowStatus);
        conditions.push(`rl.workflow_status = $${params.length}`);
      }
      const extraWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

      const query = `
          SELECT
            to_char(rl.created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS count
          FROM receiving_line rl
          WHERE rl.organization_id = $1
            ${extraWhere}
          GROUP BY day
          ORDER BY day DESC
        `;

      const result = await tenantQuery<{ day: string | null; count: number }>(orgId, query, params);
      const byDay: Record<string, number> = {};
      let total = 0;
      for (const r of result.rows) {
        const day = r.day ?? 'Unknown';
        byDay[day] = (byDay[day] ?? 0) + Number(r.count);
        total += Number(r.count);
      }
      return { total, byDay, truncated: false };
    },
  );

  return NextResponse.json(payload);
}, { permission: 'receiving.view' });
