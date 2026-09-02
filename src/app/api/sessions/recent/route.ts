/**
 * GET /api/sessions/recent — this staffer's recent work sessions (timesheet MRU).
 * Own clock; withAuth only.
 */

import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { listRecentSessions } from '@/lib/sessions/work-sessions';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const limit = Math.max(1, Math.min(24, Number(req.nextUrl.searchParams.get('limit') || 12)));
  const result = await listRecentSessions({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    limit,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ sessions: result.sessions });
});
