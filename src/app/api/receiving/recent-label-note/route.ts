/** GET /api/receiving/recent-label-note?excludeLineId= */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseExcludeLineIdParam } from '@/lib/receiving/exclude-line-id-param';
import { fetchMostRecentProcessedLabelNote } from '@/lib/receiving/recent-label-note-server';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const parsed = parseExcludeLineIdParam(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: 400 },
    );
  }
  const { excludeLineId } = parsed;
  const orgId = ctx.organizationId;
  // ORG-WIDE, never scoped to this operator's own scans: the bench is shared
  // (one operator scans in, another labels), so "prefer mine" served a
  // nine-day-old phrase over yesterday's. See the server module's docblock.
  const row = await fetchMostRecentProcessedLabelNote(orgId, { excludeLineId });

  return NextResponse.json({
    success: true,
    note: row?.note ?? null,
    lineId: row?.lineId ?? null,
    appliedAt: row?.appliedAt ?? null,
    trackingNumber: row?.trackingNumber ?? null,
    receivingId: row?.receivingId ?? null,
  });
}, { permission: 'receiving.view' });
