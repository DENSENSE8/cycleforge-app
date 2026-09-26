/** GET /api/staff-goals/me — the logged-in staffer's own station goals. */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getMyStationGoals } from '@/lib/neon/staff-stations-queries';

export const runtime = 'nodejs';

export const GET = withAuth(async (_req, ctx) => {
  // Thread the verified tenant id so getMyStationGoals routes through the tenant executor (RLS GUC) and adds the explicit org predicates:
  const stations = await getMyStationGoals(ctx.staffId, ctx.organizationId);
  const primary = stations.find((s) => s.is_primary)?.station ?? stations[0]?.station ?? null;
  return NextResponse.json({
    primary,
    hasSwitch: stations.length > 1,
    stations,
  });
});
