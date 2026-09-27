/** /api/nav/recents — the contextual sidebar's recents lists, one row shape for every surface (src/lib/nav/recents). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { NavRecentOpenBody, NavRecentsQuery } from '@/lib/schemas/nav';
import { listNavRecents, recordNavRecentOpen, type NavRecentsFailure } from '@/lib/nav/recents/service';

export const dynamic = 'force-dynamic';

function failure(result: NavRecentsFailure): NextResponse {
  const { ok: _ok, status, ...body } = result;
  return NextResponse.json(body, { status });
}

/** GET ?surface=<id>&limit=<n>[&before=][&q=] → `{ surface, rows: NavRecentRow[], nextBefore }` for the signed-in staffer. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = parseBody(NavRecentsQuery, Object.fromEntries(new URL(req.url).searchParams));
    if (parsed instanceof NextResponse) return parsed;
    const result = await listNavRecents(
      { orgId: ctx.organizationId, staffId: ctx.staffId, permissions: ctx.permissions },
      parsed,
    );
    if (!result.ok) return failure(result);
    return NextResponse.json({ surface: result.surface, rows: result.rows, nextBefore: result.nextBefore });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/recents');
  }
});

/**
 * POST { surface, entityType, entityId, label } — record an open on a
 * `nav_recents` surface (upsert + per-surface cap). Adapter surfaces → 400.
 * Navigation telemetry like `/api/receiving-lines/view` and
 * `/api/search/opened`: not an audited business mutation.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(NavRecentOpenBody, raw);
    if (parsed instanceof NextResponse) return parsed;
    const result = await recordNavRecentOpen(
      { orgId: ctx.organizationId, staffId: ctx.staffId, permissions: ctx.permissions },
      parsed,
    );
    if (!result.ok) return failure(result);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 'POST /api/nav/recents');
  }
});
