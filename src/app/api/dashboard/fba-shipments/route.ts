import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrSet, createCacheLookupKey } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

// ── GET /api/dashboard/fba-shipments ─────────────────────────────────────────
// FBA shipments from the lifecycle tables with aggregated item readiness counts
// and staff names. Serves `FbaShipmentsTable` (Dashboard + Shipping FBA tabs).
//
// 2026-07-17: dropped the pre-migration `receiving_carton` fallback and its two
// `information_schema` probes — `fba_shipments` ships in the baseline migration
// (`0000_baseline_through_2026-03.sql`) and is modeled in Drizzle, so the probe
// could never fail and the legacy branch was unreachable.
export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get('q') || '').trim();
    const limitRaw = Number(searchParams.get('limit') || 200);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 200;

    // 60s-polled dashboard board. Cache the whole payload org-scoped (busted by
    // every FBA write via fba-board / fba-today) so the heavy aggregate runs
    // once per cache miss, not on every request.
    const rows = await getOrSet<unknown[]>(
      CACHE_NS.fbaDashboard,
      ctx.organizationId,
      createCacheLookupKey({ q, limit }),
      CACHE_TTL.rollup,
      [CACHE_TAGS.fbaBoard, CACHE_TAGS.fbaToday],
      async () => {
        const params: unknown[] = [];
        let idx = 1;
        const conditions: string[] = [];

        // Tenant ownership filter — never return another org's FBA shipments.
        conditions.push(`fs.organization_id = $${idx++}`);
        params.push(ctx.organizationId);

        if (q) {
          conditions.push(`(fs.shipment_ref ILIKE $${idx} OR fs.notes ILIKE $${idx} OR tech.name ILIKE $${idx} OR packer.name ILIKE $${idx})`);
          params.push(`%${q}%`);
          idx++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(limit);

        const result = await tenantQuery(
          ctx.organizationId,
          `SELECT
             fs.id,
             fs.shipment_ref,
             fs.destination_fc,
             -- Civil day (DATE column) — hand the UI a 'YYYY-MM-DD' key, never a
             -- Date the client would reparse in its own zone (date SoT).
             fs.due_date::text AS due_date,
             fs.status,
             fs.notes,
             fs.shipped_at,
             fs.created_at,
             fs.created_by_staff_id,
             fs.assigned_tech_id,
             fs.assigned_packer_id,
             creator.name  AS created_by_name,
             tech.name     AS assigned_tech_name,
             packer.name   AS assigned_packer_name,
             COUNT(fsi.id)                                               AS total_items,
             -- "Ready" = every item that has left PLANNED, i.e. the whole
             -- progressed set. PACKED landed in 2026-05-28_fba_status_rename_
             -- tested_packed.sql and was missing here, so an all-PACKED
             -- shipment rendered a 0/N empty bar on the board.
             COUNT(fsi.id) FILTER (
               WHERE fsi.status IN ('TESTED', 'PACKED', 'LABEL_ASSIGNED', 'SHIPPED')
             )                                                           AS ready_items,
             COALESCE(SUM(fsi.expected_qty), 0)                          AS total_expected_qty,
             COALESCE(SUM(fsi.actual_qty), 0)                            AS total_actual_qty
           FROM fba_shipments fs
           LEFT JOIN staff creator ON creator.id = fs.created_by_staff_id
           LEFT JOIN staff tech    ON tech.id    = fs.assigned_tech_id
           LEFT JOIN staff packer  ON packer.id  = fs.assigned_packer_id
           LEFT JOIN fba_shipment_items fsi ON fsi.shipment_id = fs.id AND fsi.organization_id = fs.organization_id
           ${whereClause}
           GROUP BY fs.id, creator.name, tech.name, packer.name
           ORDER BY fs.created_at DESC
           LIMIT $${idx}`,
          params
        );

        return result.rows;
      },
    );

    return NextResponse.json({ success: true, rows });
  } catch (error: any) {
    console.error('[GET /api/dashboard/fba-shipments]', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch FBA shipments' },
      { status: 500 }
    );
  }
}, { permission: 'fba.view' });
