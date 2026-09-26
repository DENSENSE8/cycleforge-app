/** GET /api/receiving/recent-staged-location?excludeLineId= */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseExcludeLineIdParam } from '@/lib/receiving/exclude-line-id-param';
import { fetchMostRecentStagedLocation } from '@/lib/receiving/recent-staged-location-server';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const parsed = parseExcludeLineIdParam(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: 400 },
    );
  }
  const orgId = ctx.organizationId;
  // ORG-WIDE — never scoped to this operator's own stages. Same ruling as the
  // note twin: a shared bench must answer with the newest stage on the floor,
  // not with my stalest one.
  const row = await fetchMostRecentStagedLocation(orgId, {
    excludeLineId: parsed.excludeLineId,
  });

  return NextResponse.json({
    success: true,
    locationId: row?.locationId ?? null,
    label: row?.label ?? null,
    name: row?.name ?? null,
    barcode: row?.barcode ?? null,
    room: row?.room ?? null,
    lineId: row?.lineId ?? null,
    receivingId: row?.receivingId ?? null,
    stagedAt: row?.stagedAt ?? null,
  });
}, { permission: 'receiving.view' });
