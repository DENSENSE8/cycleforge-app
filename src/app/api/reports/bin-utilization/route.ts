import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

// `mv_bin_utilization` is a cross-tenant materialized view (it has no organization_id column).
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1),
    2000,
  );
  const q = (searchParams.get('q') || '').trim();
  const room = searchParams.get('room');
  const minFill = searchParams.get('minFill');

  const params: unknown[] = [];
  // $1 is always the org id (threaded into the join predicate below).
  params.push(ctx.organizationId);
  const orgIdx = params.length;

  const clauses: string[] = [];
  if (room) {
    params.push(room);
    clauses.push(`mv.room = $${params.length}`);
  }
  if (minFill) {
    const v = Number(minFill);
    if (Number.isFinite(v)) {
      params.push(v);
      clauses.push(`(mv.fill_ratio IS NOT NULL AND mv.fill_ratio >= $${params.length})`);
    }
  }
  if (q) {
    params.push(`%${q}%`);
    const qIdx = params.length;
    clauses.push(
      `(mv.bin_name ILIKE $${qIdx} OR mv.barcode ILIKE $${qIdx} OR mv.room ILIKE $${qIdx})`,
    );
  }
  // A SEARCH IS NOT A PAGE: honouring `?limit=` while `q` narrows would
  // answer "no match" for a bin one row past the bound. A searching read
  // opens to this endpoint's ceiling.
  params.push(q ? 2000 : limit);
  const where = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';

  const r = await tenantQuery(
    ctx.organizationId,
    `SELECT mv.bin_id, mv.bin_name, mv.barcode, mv.room, mv.row_label, mv.col_label,
              mv.capacity, mv.in_bin, mv.fill_ratio, mv.sku_count
         FROM mv_bin_utilization mv
         JOIN locations loc ON loc.id = mv.bin_id
        WHERE loc.organization_id = $${orgIdx}
          ${where}
        ORDER BY mv.fill_ratio DESC NULLS LAST, mv.in_bin DESC
        LIMIT $${params.length}`,
    params,
  );
  return NextResponse.json({ success: true, rows: r.rows });
}, { permission: 'reports.view' });
