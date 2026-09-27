import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { getAllStaffGoalsWithStats } from '@/lib/neon/staff-goals-queries';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { VELOCITY_ACTIVITY_TYPES, PICK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS } from '@/lib/cache/tags';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId;
  // Polled every 60s per open dashboard tab. Cache 45s org-scoped so N tabs
  // collapse onto one DB read per window; order/tech writes bust the tags.
  const payload = await getOrSet<unknown>(
    CACHE_NS.opsDashboard,
    orgId,
    'today',
    45,
    [CACHE_TAGS.orders, CACHE_TAGS.deskPickLogs],
    async () => {
  // $1 carries the tenant org id into every subquery below.
  const todayFilter = `(timezone('America/Los_Angeles', created_at))::date = (timezone('America/Los_Angeles', now()))::date`;

  // ── Summary KPIs (today, PST — no comparison window) ───────────────── shipping_tracking_numbers has no organization_id column…
  /* NO `*_yesterday` columns and no `computeDelta` — both deleted 2026-09-16. */
  const summaryQuery = `
      WITH pending_orders AS (
        SELECT o.id, o.is_out_of_stock
        FROM orders o
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        WHERE o.shipment_id IS NOT NULL
          AND o.organization_id = $1
          AND NOT ${SHIPPED_BY_CARRIER_SQL}
          AND NOT EXISTS (
            SELECT 1 FROM station_activity_logs sal
            WHERE sal.shipment_id IS NOT NULL AND sal.shipment_id = o.shipment_id
              AND sal.organization_id = $1
          )
          AND UPPER(COALESCE(o.status, '')) <> 'SHIPPED'
      ),
      late_orders AS (
        SELECT po.id
        FROM pending_orders po
        JOIN work_assignments wa ON wa.entity_type = 'ORDER'
          AND wa.entity_id = po.id
          AND wa.work_type = 'TEST'
          AND wa.status IN ('ASSIGNED', 'IN_PROGRESS', 'OPEN')
          AND wa.organization_id = $1
        WHERE wa.deadline_at IS NOT NULL AND wa.deadline_at < now()
      )
      SELECT
        (SELECT count(DISTINCT COALESCE(shipment_id::text, scan_ref, id::text))::int FROM station_activity_logs
         WHERE activity_type IN (${sqlInList(VELOCITY_ACTIVITY_TYPES)})
           AND organization_id = $1
           AND ${todayFilter}) AS all_today,
        -- Bench QC: one testing_results row per unit verdict recorded today.
        (SELECT count(*)::int FROM testing_results
         WHERE organization_id = $1
           AND ${todayFilter}) AS tested_today,
        -- Picker desk: order picks (PICK station scans) today.
        (SELECT count(DISTINCT COALESCE(shipment_id::text, scan_ref, id::text))::int FROM station_activity_logs
         WHERE station = 'PICK'
           AND activity_type IN (${sqlInList(PICK_ACTIVITY_TYPES)})
           AND organization_id = $1
           AND ${todayFilter}) AS picked_today,
        (SELECT count(*)::int FROM repair_service WHERE status NOT IN ('Done', 'Shipped', 'Picked Up') AND organization_id = $1) AS repair_count,
        (SELECT count(*)::int FROM pending_orders WHERE is_out_of_stock) AS oos_count,
        (SELECT count(*)::int FROM late_orders) AS late_count,
        (SELECT count(*)::int FROM station_activity_logs WHERE activity_type = 'FNSKU_SCANNED' AND organization_id = $1 AND ${todayFilter}) AS fba_today
    `;
  const summaryResult = await tenantQuery(orgId, summaryQuery, [orgId]);
  const s = summaryResult.rows[0];



  // ── Staff Progress ───────────────────────────────────────────────────
  const staffStats = await getAllStaffGoalsWithStats(orgId);
  const staffProgress = staffStats.map((st) => {
    const progress = st.today_count;
    const goal = st.daily_goal;
    const percent = goal > 0 ? Math.round((progress / goal) * 100) : 0;
    let status: 'on_track' | 'at_risk' | 'behind' = 'behind';
    if (percent >= 85) status = 'on_track';
    else if (percent >= 60) status = 'at_risk';

    return {
      staffId: st.staff_id,
      name: st.staff_name,
      goal: st.daily_goal,
      current: st.today_count,
      percent,
      status,
      daysLate: 0,
      station: st.station,
    };
  });

  // ── Activity Feed ────────────────────────────────────────────────────
  // staff join is on the integer surrogate PK (s.id = sal.staff_id) so it is
  // safe bare; station_activity_logs is tenant-scoped via organization_id.
  const feedQuery = `
      SELECT
        sal.id::text,
        sal.created_at as timestamp,
        sal.activity_type as type,
        sal.station as source,
        COALESCE(sal.scan_ref, sal.notes, 'Activity logged') as summary,
        sal.staff_id,
        s.name as actor_name
      FROM station_activity_logs sal
      JOIN staff s ON s.id = sal.staff_id
      WHERE sal.organization_id = $1
      ORDER BY sal.created_at DESC
      LIMIT 20
    `;
  const feedResult = await tenantQuery(orgId, feedQuery, [orgId]);

  return {
    /*
     * VALUE ONLY — no `delta`. See the note in the query above: the old
     * comparison divided a partial day by a whole one. The tiles now state
     * their window ("today, PST") in words instead of claiming a trend.
     */
    summary: {
      all: { value: s.all_today },
      tested: { value: s.tested_today },
      picked: { value: s.picked_today },
      repair: { value: s.repair_count },
      outOfStock: { value: s.oos_count },
      pendingLate: { value: s.late_count },
      fba: { value: s.fba_today },
    },
    staffProgress,
    activityFeed: feedResult.rows,
  };
    },
  );

  return NextResponse.json(payload);
}, { permission: 'operations.view' });
