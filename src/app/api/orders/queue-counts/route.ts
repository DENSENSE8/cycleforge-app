import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { logRouteMetric } from '@/lib/route-metrics';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { sqlOrderHasPackScan, sqlOrderHasShipConfirm, sqlOrderHasTechScan } from '@/lib/orders/order-grain-sql';
import { PRINT_PACKET_INCOMPLETE_SQL } from '@/lib/orders/print-packet';
import { withAuth } from '@/lib/auth/withAuth';
import { countOpenPlacementsByLocation } from '@/lib/packing/pack-placement';

/**
 * GET /api/orders/queue-counts — lightweight Unshipped-queue tallies WITHOUT
 * downloading the rows (Phase 2 of the unshipped-dashboard-performance plan).
 *
 * The sidebar legend + stage dropdown + nav badge used to count off the full
 * `/api/orders?fulfillmentScope=true` row payload — i.e. download every open
 * order just to size three numbers. This route replaces that with a single
 * `COUNT(*)` grouped by the two RAW signals the fulfillment lane is derived from
 * (`has_tech_scan`, `is_out_of_stock`). It deliberately does NOT map those
 * to PENDING/TESTED/BLOCKED here: that mapping is `deriveFulfillmentState` (SoT
 * `src/lib/order-lifecycle.ts`, Decision 8) and is applied CLIENT-side over the
 * returned `combos`. SQL only aggregates facts; TS owns the lane rule.
 *
 * Scope mirrors the in-warehouse To-ship desk: labeled (shipment_id) with a
 * non-empty tracking number (blank-tracking stays on Labels), not
 * carrier-shipped, not Amazon-fulfilled, and not yet dock-scanned (no
 * SHIP_CONFIRM). Includes packed-staged rows still sitting on a rack.
 * Optional `?staff=` narrows to one staff's assigned work (packer OR tech).
 *
 * "Mirrors" is now literal: the tech-scan and pack facts come from the shared
 * ORDER-GRAIN fragments (`sqlOrderHasTechScan` / `sqlOrderHasPackScan`), not a
 * second hand-rolled shipment-grain copy. A count that disagrees with the row
 * list is a bug in this file, so there is exactly one implementation of the
 * membership rule and both endpoints call it.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const startedAt = Date.now();
  let ok = false;
  let cache = 'BYPASS';
  try {
    const { searchParams } = new URL(req.url);
    const staffRaw = searchParams.get('staff');
    const staffId = staffRaw && Number.isFinite(Number(staffRaw)) && Number(staffRaw) > 0 ? Number(staffRaw) : null;

    const cacheLookup = createCacheLookupKey({
      organizationId: ctx.organizationId,
      staff: staffId ?? '',
      shipmentStatusRuleVersion: 'latest_status_relaxed_v2',
      // Bump when membership SQL / payload shape changes so stale tallies cannot outlive the fix.
      // Bumped for `shippedToday` (2026-08-30) — a cached payload without the
      // field would print 0 shipped today for a whole TTL on every desk.
      queueScope: 'in_warehouse_pairing_exception_v1_paperwork',
    });

    const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' };

    const cached = await getCachedJson<unknown>('api:orders-queue-counts', cacheLookup);
    if (cached) {
      ok = true;
      cache = 'HIT';
      return NextResponse.json(cached, { headers: { 'x-cache': 'HIT', ...CACHE_HEADERS } });
    }

    const params: unknown[] = [ctx.organizationId];
    let paramCount = 2;
    let staffClause = '';
    if (staffId != null) {
      staffClause = ` AND EXISTS (
        SELECT 1 FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id
          AND wa.status <> 'CANCELED'
          AND (wa.assigned_packer_id = $${paramCount} OR wa.assigned_tech_id = $${paramCount})
      )`;
      params.push(staffId);
      paramCount++;
    }

    // GROUP BY the two raw signals only. At most 4 rows come back
    // (has_tech_scan × blocked); the client maps each via deriveFulfillmentState.
    //
    // ORDER-GRAIN (CF-03 / CF-04). Both membership facts below come from
    // `@/lib/orders/order-grain-sql` — the SAME fragments `/api/orders` uses for
    // the row list. They used to be hand-rolled shipment-grain EXISTS here, and
    // that is precisely why the badge could disagree with the grid:
    //
    //   - `has_tech_scan` was `EXISTS(sal WHERE sal.shipment_id = o.shipment_id)`
    //     with NO activity_type filter, so ANY station activity on a shared
    //     carton — a pack scan, a receiving scan — counted as "tested". That
    //     inflated `tested` and, since `pending = total - tested`, deflated
    //     Pending. `sqlOrderHasTechScan` requires a real TECH_TEST activity
    //     attributed to THIS order (tsn.order_id / metadata.order_row_id), with
    //     the shipment-grain path only when the shipment has a single order.
    //   - the pack exclusion was shipment-grain `NOT EXISTS`, which drops an
    //     order because a SIBLING sharing its carton was packed — the "vanish
    //     bug" the row route's own comment names.
    //
    // Two endpoints answering "is this order in the queue?" differently is the
    // defect; there is one answer and it lives in order-grain-sql.ts.
    const sql = `
      SELECT
        ${sqlOrderHasTechScan('o')} AS has_tech_scan,
        ${sqlOrderHasPackScan('o')} AS has_pack_scan,
        o.is_out_of_stock AS blocked,
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE o.is_urgent)::int AS urgent_n,
        COUNT(*) FILTER (
          WHERE COALESCE(wa_d.deadline_at, NULL) IS NOT NULL
            AND timezone('America/Los_Angeles', wa_d.deadline_at)::date
              <= timezone('America/Los_Angeles', NOW())::date
        )::int AS must_ship_n
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      LEFT JOIN LATERAL (
        SELECT wa.deadline_at
        FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id
          AND wa.status <> 'CANCELED'
          AND wa.deadline_at IS NOT NULL
        ORDER BY wa.deadline_at ASC
        LIMIT 1
      ) wa_d ON true
      WHERE o.organization_id = $1
        /*
         * Scope MUST mirror /api/orders?fulfillmentScope=true -- these counts
         * label that queue's tabs and drive its "Load more" ceiling, so a
         * narrower scope here prints totals smaller than the rows on screen.
         * The shipment_id IS NOT NULL + non-blank-tracking pair was dropped
         * there on 2026-08-30 (needing a label became a STATE in the queue,
         * not a separate table), and it is dropped here for the same reason.
         */
        AND NOT ${SHIPPED_BY_CARRIER_SQL}
        AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
        AND NOT ${sqlOrderHasShipConfirm('o')}${staffClause}
      GROUP BY 1, 2, 3
    `;

    /**
     * "Shipped today" — the third number on To-ship's today strip, and the one
     * that hands off to the Shipped desk.
     *
     * Counted off `station_activity_logs` at the PACK station, because that is
     * exactly the feed the Shipped desk lists (`/api/packerlogs` →
     * `packer-logs-week.ts`). Counting SHIP_CONFIRM instead would be a
     * different, defensible truth — and it would print a number the operator
     * cannot find when they click through to today's window, which is worse
     * than either truth alone.
     *
     * Civil PST day, the same frame `getCurrentPSTDateKey` and the week ranges
     * use, so "today" does not roll over at 5pm local.
     *
     * `?staff=` narrows to who PACKED it. The row feed's staff filter is
     * packed-OR-tested, so a staff-scoped count can read low against a
     * staff-scoped list; that is a known, documented narrowing rather than a
     * second membership rule — the strip is org-wide on the default desk.
     */
    const shippedTodayParams: unknown[] = [ctx.organizationId];
    let shippedTodayStaffClause = '';
    if (staffId != null) {
      shippedTodayParams.push(staffId);
      shippedTodayStaffClause = ` AND sal.staff_id = $${shippedTodayParams.length}`;
    }
    const shippedTodaySql = `
      SELECT COUNT(*)::int AS n
      FROM station_activity_logs sal
      WHERE sal.organization_id = $1
        AND sal.station = 'PACK'
        AND timezone('America/Los_Angeles', sal.created_at)::date
          = timezone('America/Los_Angeles', NOW())::date${shippedTodayStaffClause}
    `;

    const paperworkSql = `
      SELECT COUNT(*)::int AS n
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = $1
        AND NOT ${SHIPPED_BY_CARRIER_SQL}
        AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
        AND NOT ${sqlOrderHasShipConfirm('o')}${staffClause}
        AND ${PRINT_PACKET_INCOMPLETE_SQL}
    `;

    // Independent queries, so they run concurrently rather than stacking two
    // round trips on the desk's first paint.
    const [result, shippedTodayResult, paperworkResult] = await Promise.all([
      tenantQuery(ctx.organizationId, sql, params),
      tenantQuery(ctx.organizationId, shippedTodaySql, shippedTodayParams),
      tenantQuery(ctx.organizationId, paperworkSql, params),
    ]);
    const shippedToday = Number(shippedTodayResult.rows[0]?.n) || 0;
    const paperworkIncomplete = Number(paperworkResult.rows[0]?.n) || 0;
    // Lane combos stay pre-pack only (PENDING/TESTED/BLOCKED); packed-staged
    // is a separate stage counted via byStage.packed.
    const combos = result.rows
      .filter((r) => !r.has_pack_scan)
      .map((r) => ({
        hasTechScan: Boolean(r.has_tech_scan),
        blocked: Boolean(r.blocked),
        count: Number(r.n) || 0,
      }));
    const packedCount = result.rows
      .filter((r) => r.has_pack_scan)
      .reduce((s, r) => s + (Number(r.n) || 0), 0);
    const prePackTotal = combos.reduce((sum, c) => sum + c.count, 0);
    const total = prePackTotal + packedCount;
    const testedRaw = combos.filter((c) => c.hasTechScan).reduce((s, c) => s + c.count, 0);
    const urgent = result.rows.reduce((s, r) => s + (Number(r.urgent_n) || 0), 0);
    const mustShip = result.rows.reduce((s, r) => s + (Number(r.must_ship_n) || 0), 0);

    const packPlacementCounts = await countOpenPlacementsByLocation(ctx.organizationId);
    const packPlacementPlaced = packPlacementCounts.reduce((s, r) => s + r.count, 0);

    const payload = {
      total,
      byStage: {
        all: total,
        tested: testedRaw,
        pending: prePackTotal - testedRaw,
        packed: packedCount,
      },
      urgent,
      mustShip,
      shippedToday,
      combos,
      packPlacement: {
        counts: packPlacementCounts,
        totalPlaced: packPlacementPlaced,
      },
      paperworkIncomplete,
    };

    await setCachedJson('api:orders-queue-counts', cacheLookup, payload, 60, ['orders']);
    cache = 'MISS';
    ok = true;
    return NextResponse.json(payload, { headers: { 'x-cache': 'MISS', ...CACHE_HEADERS } });
  } catch (error) {
    console.error('Error in GET /api/orders/queue-counts:', error);
    // SUB-RESOURCE: a sidebar count must not 500 the queue, so this stays 200 —
    // but zero is a real answer here ("nothing needs you"), so the fallback
    // carries `degraded` rather than passing itself off as an honest all-clear.
    return NextResponse.json(
      {
        total: 0,
        byStage: { all: 0, tested: 0, pending: 0, packed: 0 },
        urgent: 0,
        mustShip: 0,
        shippedToday: 0,
        combos: [],
        packPlacement: { counts: [], totalPlaced: 0 },
        paperworkIncomplete: 0,
        degraded: true,
        error: 'queue_counts_unavailable',
      },
      { status: 200, headers: { 'x-db-fallback': 'error' } },
    );
  } finally {
    logRouteMetric({ route: '/api/orders/queue-counts', method: 'GET', startedAt, ok, details: { cache } });
  }
}, { permission: 'orders.view' });
