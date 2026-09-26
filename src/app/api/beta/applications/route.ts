/** GET /api/beta/applications?status=RECEIVED&limit=100 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { isBetaApplicationStatus } from '@/lib/beta/apply-schema';

export const runtime = 'nodejs';

export const GET = withAuth(async (req: NextRequest) => {
  const statusParam = req.nextUrl.searchParams.get('status');
  if (statusParam !== null && !isBetaApplicationStatus(statusParam)) {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }
  const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 200);
  if (!Number.isFinite(limitRaw)) {
    return NextResponse.json({ error: 'INVALID_LIMIT' }, { status: 400 });
  }
  const limit = Math.min(500, Math.max(1, Math.floor(limitRaw)));

  const params: unknown[] = [limit];
  let where = '';
  if (statusParam) {
    params.push(statusParam);
    where = `WHERE status = $${params.length}`;
  }

  const r = await pool.query(
    `SELECT id, email, company_name, tier, status, answers, stripe_ref,
            created_at, updated_at
       FROM beta_applications
       ${where}
      ORDER BY created_at DESC
      LIMIT $1`,
    params,
  );

  return NextResponse.json({ applications: r.rows });
}, { permission: 'beta.review' });
