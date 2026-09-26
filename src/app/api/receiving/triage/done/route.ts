import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { sqlReceivingPhotoCount } from '@/lib/photos/queries/receiving-list';

/** GET /api/receiving/triage/done — cartons staged + saved for unbox (`receiving_triage.triage_complete = true`), newest-completed first. */
interface DoneRow {
  id: number;
  zoho_purchaseorder_number: string | null;
  tracking_number: string | null;
  source_platform: string | null;
  source: string | null;
  staging_location_id: number | null;
  priority_lane: string | null;
  triage_completed_at: string;
  item_name: string | null;
  sku: string | null;
  photo_count: string;
}

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500);

  const conditions: string[] = ['r.organization_id = $1', 'COALESCE(rt.triage_complete, false) = true'];
  const params: unknown[] = [ctx.organizationId];
  let idx = 2;

  if (q) {
    conditions.push(
      `(rl.item_name ILIKE $${idx} OR rl.sku ILIKE $${idx} OR r.zoho_purchaseorder_number ILIKE $${idx} OR stn.tracking_number_raw ILIKE $${idx})`,
    );
    params.push(`%${q}%`);
    idx++;
  }

  params.push(limit);

  const sql = `
    SELECT
      r.id,
      r.zoho_purchaseorder_number,
      stn.tracking_number_raw AS tracking_number,
      r.source_platform,
      r.source,
      rt.staging_location_id,
      rt.priority_lane,
      rt.triage_completed_at::text AS triage_completed_at,
      rl.item_name,
      rl.sku,
      ${sqlReceivingPhotoCount('r.id', '$1')} AS photo_count
    FROM receiving_carton r
    LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
    LEFT JOIN LATERAL (
      SELECT item_name, sku FROM receiving_line
      WHERE receiving_id = r.id
      ORDER BY id ASC
      LIMIT 1
    ) rl ON true
    WHERE ${conditions.join(' AND ')}
    ORDER BY rt.triage_completed_at DESC
    LIMIT $${idx}
  `;

  const result = await tenantQuery<DoneRow>(ctx.organizationId, sql, params);

  return NextResponse.json({
    success: true,
    rows: result.rows,
    total: result.rows.length,
  });
}, { permission: 'receiving.view' });
