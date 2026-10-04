import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/auth/audit';
import type { AuthContext } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { LiveFeedQuery } from '@/lib/schemas/live-feed';
import { LIVE_FEED_PARAMS, normalizeLiveFeedFilters } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSIONS } from '@/lib/live-feed/statuses';
import type { LiveFeedFilters, LiveFeedStatusFilters } from '@/lib/live-feed/types';

/**
 * The Live feed APIs open with `packing.view` OR `receiving.view` (each
 * direction is then gated by the loader). Null when allowed; else the audited
 * 403 — the `withAuth` refusal's shape, for an any-of gate it cannot express.
 */
async function refuseLiveFeedWithoutAccess(req: NextRequest, ctx: AuthContext): Promise<NextResponse | null> {
  if (LIVE_FEED_PERMISSIONS.some((p) => ctx.permissions.has(p))) return null;
  await audit({
    staffId: ctx.staffId,
    event: 'permission.denied',
    result: 'denied',
    sid: ctx.session?.sid ?? null,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: req.headers.get('user-agent'),
    detail: { permission: LIVE_FEED_PERMISSIONS.join('|'), api: true, path: req.nextUrl.pathname },
  });
  return NextResponse.json(
    { error: 'FORBIDDEN', permission: LIVE_FEED_PERMISSIONS.join('|'), role: ctx.role },
    { status: 403 },
  );
}

/** Every Live feed API's front door: the any-of gate, then the query parsed and normalized. */
export async function readLiveFeedRequest(req: NextRequest, ctx: AuthContext): Promise<NextResponse | LiveFeedFilters> {
  const refused = await refuseLiveFeedWithoutAccess(req, ctx);
  if (refused) return refused;
  const parsed = parseBody(LiveFeedQuery, Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (parsed instanceof NextResponse) return parsed;
  return normalizeLiveFeedFilters(parsed);
}

/**
 * The list and the Copy all read ONE status: a missing one, or one the
 * direction / channel do not hold (normalized to the Board), is a 400.
 */
export function requireLiveFeedStatus(filters: LiveFeedFilters): NextResponse | LiveFeedStatusFilters {
  if (filters.status != null) return { ...filters, status: filters.status };
  return NextResponse.json(
    { error: 'BAD_REQUEST', message: `${LIVE_FEED_PARAMS.status} must name a status of ${LIVE_FEED_PARAMS.dir} and ${LIVE_FEED_PARAMS.channel}` },
    { status: 400 },
  );
}
