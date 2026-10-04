import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readLiveFeedRequest } from '@/lib/live-feed/api-gate';
import { loadLiveFeedBoard } from '@/lib/live-feed/load';

/**
 * GET /api/live-feed/board?dir=&channel=&staff=&lens=&from=&to=&timeFrom=&timeTo=&carrier=&q=&carry=
 *
 * The Live feed Board (`/operations/live-feed`): every lane of the direction
 * inside the channel pick, in pipeline order — each package in exactly one
 * lane, its current state. Each column: `applicable` (can the lane have had
 * the lens event), exact `count`, `lateCount`, `oldestAt`, `carriedOver` (open
 * lanes) or `previousCount` (done lanes), top `LIVE_FEED_BOARD_GROUP_CAP`
 * `groups` (+ `groupsMore`) and its first `LIVE_FEED_BOARD_COLUMN_CAP` items,
 * late first. The range always applies (default: today). `status` and `page`
 * are ignored. Same gate as `/api/live-feed`; a direction the caller lacks is
 * a 403.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const filters = await readLiveFeedRequest(req, ctx);
  if (filters instanceof NextResponse) return filters;

  const board = await loadLiveFeedBoard(ctx.organizationId, filters, ctx.permissions);
  if (!board) return NextResponse.json({ error: 'FORBIDDEN', dir: filters.dir, role: ctx.role }, { status: 403 });
  return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
});
