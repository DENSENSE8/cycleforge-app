import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';

/** GET /api/receiving/triage/staging-map — every carton with a shelf and/or lane assigned (staged, whether or not triage is complete yet),… */
interface StagingMapRow {
  id: number;
  staging_location_id: number | null;
  location_name: string | null;
  location_room: string | null;
  priority_lane: string | null;
  triage_complete: boolean;
}

export const GET = withAuth(async (_request: NextRequest, ctx) => {
  const sql = `
    SELECT
      r.id,
      rt.staging_location_id,
      l.name AS location_name,
      l.room AS location_room,
      rt.priority_lane,
      COALESCE(rt.triage_complete, false) AS triage_complete
    FROM receiving_carton r
    LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
    LEFT JOIN locations l ON l.id = rt.staging_location_id
    WHERE r.organization_id = $1
      AND (rt.staging_location_id IS NOT NULL OR rt.priority_lane IS NOT NULL OR COALESCE(rt.triage_complete, false) = true)
    ORDER BY rt.triage_completed_at DESC NULLS LAST, r.updated_at DESC NULLS LAST
    LIMIT 500
  `;

  const result = await tenantQuery<StagingMapRow>(ctx.organizationId, sql, [ctx.organizationId]);

  return NextResponse.json({ success: true, rows: result.rows });
}, { permission: 'receiving.view' });
