import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { logRouteMetric } from '@/lib/route-metrics';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { sqlOrderHasPackScan, sqlOrderHasTechScan } from '@/lib/orders/order-grain-sql';
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
      queueScope: 'in_warehouse_order_grain_v1',
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
        AND o.shipment_id IS NOT NULL
        AND COALESCE(TRIM(stn.tracking_number_raw), '') <> ''
        AND NOT ${SHIPPED_BY_CARRIER_SQL}
        AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
        AND NOT EXISTS (
          SELECT 1 FROM station_activity_logs sal_out
          WHERE sal_out.shipment_id = o.shipment_id
            AND sal_out.organization_id = o.organization_id
            AND sal_out.activity_type = 'SHIP_CONFIRM'
        )${staffClause}
      GROUP BY 1, 2, 3
    `;

    const result = await tenantQuery(ctx.organizationId, sql, params);
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
      combos,
      packPlacement: {
        counts: packPlacementCounts,
        totalPlaced: packPlacementPlaced,
      },
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
        combos: [],
        packPlacement: { counts: [], totalPlaced: 0 },
        degraded: true,
        error: 'queue_counts_unavailable',
      },
      { status: 200, headers: { 'x-db-fallback': 'error' } },
    );
  } finally {
    logRouteMetric({ route: '/api/orders/queue-counts', method: 'GET', startedAt, ok, details: { cache } });
  }
}, { permission: 'orders.view' });
