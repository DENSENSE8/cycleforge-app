import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  loadStrictRehearsalReport,
  STRICT_REHEARSAL_WINDOW_DAYS,
} from '@/lib/auth/strict-rehearsal';

export const dynamic = 'force-dynamic';

/** GET /api/admin/authorization-readiness — prospective strict-mode permission failures. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const rawDays = Number(req.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(rawDays) && rawDays > 0
    ? rawDays
    : STRICT_REHEARSAL_WINDOW_DAYS;
  const report = await loadStrictRehearsalReport(tenantQuery, ctx.organizationId, days);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    ...report,
  });
}, { permission: 'admin.manage_roles' });
