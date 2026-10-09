import { NextRequest, NextResponse, after } from 'next/server';
import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { withAuth } from '@/lib/auth/withAuth';
import { fetchDeskPickLogRows } from '@/lib/picking/desk-pick-logs-query';

/** GET /api/picking/desk/logs — the Picker desk scan history (desk-pick-logs rows). */

/** A searching fetch ignores the caller's page bound and reads the whole week. */
const SEARCH_ROW_CEILING = 5000;

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const techIdRaw = String(searchParams.get('techId') || '').trim().toLowerCase();
  const wantAll = techIdRaw === 'all';
  const techIdParam = Number(techIdRaw);
  const isAdminFilter =
    !wantAll && Number.isFinite(techIdParam) && techIdParam > 0 && ctx.permissions.has('admin.view_logs');
  const techId = wantAll ? null : isAdminFilter ? techIdParam : ctx.staffId;
  const orgId = ctx.organizationId;
  const weekStart = searchParams.get('weekStart') || '';
  const weekEnd = searchParams.get('weekEnd') || '';
  const searchTerm = (searchParams.get('q') || '').trim();
  const requestedLimit = Number.parseInt(searchParams.get('limit') || '500', 10);
  const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
  const limit = searchTerm
    ? SEARCH_ROW_CEILING
    : Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 500, 1), 2000);
  const offset = searchTerm ? 0 : Math.max(Number.isFinite(requestedOffset) ? requestedOffset : 0, 0);

  if (!wantAll && !techId) {
    return NextResponse.json({ error: 'techId is required' }, { status: 400 });
  }

  const cacheKey = createCacheLookupKey({
    orgId,
    techId: wantAll ? 'all' : techId,
    weekStart,
    weekEnd,
    limit,
    offset,
    // The query text is part of the ANSWER, so it has to be part of the key —
    // without it a searched page and the unfiltered week share one entry and
    // whichever lands first is served to the other.
    q: searchTerm,
  });
  const isLiveScope = !weekStart;
  const cacheTtl = isLiveScope ? 60 : 3600;

  try {
    // v4: rows now resolve their order by the anchor's `order_row_id` (order-anchored picks had none).
    const cached = await getCachedJson<unknown[]>('api:desk-pick-logs-v4', cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'x-cache': 'HIT' } });
    }

    const rows = await fetchDeskPickLogRows(orgId, {
      techId: wantAll ? null : techId,
      weekStart,
      weekEnd,
      searchTerm,
      limit,
      offset,
    });

    after(() => setCachedJson('api:desk-pick-logs-v4', cacheKey, rows, cacheTtl, ['desk-pick-logs']));
    return NextResponse.json(rows, { headers: { 'x-cache': 'MISS' } });
  } catch (error: any) {
    console.error('Error fetching tech logs:', error);
    return NextResponse.json({ error: 'Failed to fetch tech logs', details: error.message }, { status: 500 });
  }
}, { permission: 'picking.view' });
