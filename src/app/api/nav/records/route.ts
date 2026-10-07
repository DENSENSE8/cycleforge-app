/** /api/nav/records — the Records sheet: every inbound and outbound LINE, filtered, sorted and counted server-side (`/records`; src/lib/nav/records). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { navRecordsDeps } from '@/lib/nav/records/read';
import { getNavRecords } from '@/lib/nav/records/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET ?<the page's params, `RECORDS_PARAMS` + q + refs + colsort/coldir> →
 * `NavRecordsResponse` (compact wire). Gated in the service by `orders.view`
 * OR `receiving.view` (`NAV_RECORDS_PERMISSION`): a caller holding one reads
 * only that direction, so the sidebar's facet counts answer the same way.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const result = await getNavRecords(
      { orgId: ctx.organizationId, permissions: ctx.permissions, staffId: ctx.staffId },
      new URL(req.url).searchParams,
      navRecordsDeps,
    );
    if (!result.ok) {
      const { ok: _ok, status, ...body } = result;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json(result.body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/records');
  }
});
