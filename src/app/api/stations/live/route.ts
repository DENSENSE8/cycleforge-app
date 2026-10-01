import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { bindPersonalStationFeed } from '@/lib/station-feed/personal';
import {
  parseStationFeedQuery,
  queryStationLiveFeed,
  StationFeedInputError,
} from '@/lib/station-feed/query.server';

export const dynamic = 'force-dynamic';

/** GET /api/stations/live — tenant-scoped phone station ledger projection. */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const query = bindPersonalStationFeed(
      parseStationFeedQuery(request.nextUrl.searchParams),
      ctx.staffId,
    );
    const response = await queryStationLiveFeed(ctx.organizationId, query);
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof StationFeedInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error, 'GET /api/stations/live');
  }
}, { permission: 'operations.view' });
