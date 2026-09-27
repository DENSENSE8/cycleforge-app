/** GET /api/nav/context — the session's `NavContext` for a URL (the contextual sidebar over HTTP, for Tauri). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { NavContextQuerySchema } from '@/lib/nav/context/schema';
import { getNavContextForStaff } from '@/lib/nav/context/service';

export const dynamic = 'force-dynamic';

// Any signed-in staffer: the context is permission-filtered by `ctx.permissions`.
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const search = req.nextUrl.searchParams;
  const parsed = NavContextQuerySchema.safeParse({
    path: search.get('path') ?? undefined,
    view: search.get('view') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_QUERY', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const nav = await getNavContextForStaff({
      ...parsed.data,
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      permissions: ctx.permissions,
    });
    return NextResponse.json(nav, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/context');
  }
});
