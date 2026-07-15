import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrSet, createCacheLookupKey } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

// ── GET /api/dashboard/fba-shipments ─────────────────────────────────────────
// Returns FBA shipments from fba_shipments (new lifecycle tables) with
// aggregated item readiness counts and staff names for the dashboard board.
// Falls back gracefully if the tables don't exist yet (pre-migration).
export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get('q') || '').trim();
    const limitRaw = Number(searchParams.get('limit') || 200);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 200;

    // 60s-polled dashboard board. Cache the whole payload org-scoped (busted by
    // every FBA write via fba-board / fba-today) so the two information_schema
    // existence probes AND the heavy aggregate run once per cache miss, not on
    // every request.
    const { rows, source } = await getOrSet<{ rows: unknown[]; source: string }>(
      CACHE_NS.fbaDashboard,
      ctx.organizationId,
      createCacheLookupKey({ q, limit }),
      CACHE_TTL.rollup,
      [CACHE_TAGS.fbaBoard, CACHE_TAGS.fbaToday],
      async () => {
        // Check if the new lifecycle tables exist yet
        const tableExists = await pool.query(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.tables WHERE table_name = 'fba_shipments'
           ) AS exists`
        );

        if (!tableExists.rows[0]?.exists) {
          // Pre-migration fallback: old receiving-based query
          const receivingExists = await pool.query(
            `SELECT EXISTS (
               SELECT 1 FROM information_schema.tables WHERE table_name = 'receiving_carton'
             ) AS exists`
          );
          if (!receivingExists.rows[0]?.exists) {
            return { rows: [], source: 'none' };
          }

          // Door-arrival stamp lives on receiving_triage (Wave-3 street cutover) —
          // the old column-gated spine read would have silently gone NULL when
          // receiving_carton.received_at dropped.
          const receivedAtSelect = 'rt.door_received_at::text';

          const legacy = await pool.query(
            `SELECT
               r.id,
               stn.tracking_number_raw AS shipment_ref,
               COALESCE(NULLIF(stn.carrier, 'UNKNOWN'), r.carrier)             AS carrier,
               r.qa_status,
               r.disposition_code,
               r.condition_grade,
               r.target_channel,
               r.needs_test,
               r.assigned_tech_id,
               s.name AS assigned_tech_name,
               ${receivedAtSelect} AS received_at,
               'LEGACY' AS source
             FROM receiving_carton r
             LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
             LEFT JOIN staff s ON s.id = r.assigned_tech_id
             WHERE (r.shipment_id IS NOT NULL
                    OR (stn.tracking_number_raw IS NOT NULL AND stn.tracking_number_raw <> ''))
               AND UPPER(COALESCE(r.target_channel::text, '')) = 'FBA'
               AND ($1 = ''
                    OR stn.tracking_number_raw ILIKE '%' || $1 || '%'
                    OR stn.tracking_number_raw     ILIKE '%' || $1 || '%'
                    OR COALESCE(s.name,'') ILIKE '%' || $1 || '%')
             ORDER BY r.id DESC
             LIMIT $2`,
            [q, limit]
          );
          return { rows: legacy.rows, source: 'legacy' };
        }

        // New lifecycle query
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
             fs.due_date,
             fs.status,
             fs.notes,
             fs.shipped_at,
             fs.created_at,
             fs.updated_at,
             fs.created_by_staff_id,
             fs.assigned_tech_id,
             fs.assigned_packer_id,
             creator.name  AS created_by_name,
             tech.name     AS assigned_tech_name,
             packer.name   AS assigned_packer_name,
             COUNT(fsi.id)                                               AS total_items,
             COUNT(fsi.id) FILTER (WHERE fsi.status = 'TESTED')    AS ready_items,
             COUNT(fsi.id) FILTER (WHERE fsi.status = 'LABEL_ASSIGNED') AS labeled_items,
             COUNT(fsi.id) FILTER (WHERE fsi.status = 'SHIPPED')        AS shipped_items,
             COALESCE(SUM(fsi.expected_qty), 0)                          AS total_expected_qty,
             COALESCE(SUM(fsi.actual_qty), 0)                            AS total_actual_qty,
             'lifecycle' AS source
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

        return { rows: result.rows, source: 'lifecycle' };
      },
    );

    return NextResponse.json({ success: true, rows, source });
  } catch (error: any) {
    console.error('[GET /api/dashboard/fba-shipments]', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch FBA shipments' },
      { status: 500 }
    );
  }
}, { permission: 'fba.view' });
