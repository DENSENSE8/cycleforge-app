/**
 * GET /api/user-issues/[id] — single reported issue (UIC-1).
 * Path id parsed from the URL (withAuth ignores route params Promise).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { getReportedIssue, type UserIssuesDeps } from '@/lib/user-issues/issues';

export const runtime = 'nodejs';

const dbDeps: UserIssuesDeps = {
  query: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

function idFromUrl(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  // /api/user-issues/:id
  const n = Number(parts[parts.length - 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const id = idFromUrl(request);
    if (id == null) {
      return NextResponse.json({ success: false, error: 'Invalid issue id' }, { status: 400 });
    }

    const issue = await getReportedIssue(ctx.organizationId, id, dbDeps);
    if (!issue) {
      return NextResponse.json({ success: false, error: 'Issue not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, issue });
  } catch (error: unknown) {
    console.error('Error in GET /api/user-issues/[id]:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load issue' },
      { status: 500 },
    );
  }
}, { permission: 'support.issues.view' });
