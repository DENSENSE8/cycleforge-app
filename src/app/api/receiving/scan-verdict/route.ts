import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { probeScanMatch, scanVerdictFromProbe } from '@/lib/receiving/scan-match-probe';

/**
 * Found vs unfound for a scanned carrier tracking — `GET /api/receiving/scan-verdict?tracking=`.
 *
 * Read-only and ONE database round trip (the lookup-po probe), so the Unbox
 * station can say found / unfound the instant a label is scanned while
 * `/api/receiving/lookup-po` is still minting / opening the carton.
 */
export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const tracking = (new URL(request.url).searchParams.get('tracking') ?? '').trim();
    if (!tracking) {
      return NextResponse.json({ success: false, error: 'tracking is required' }, { status: 400 });
    }
    const verdict = scanVerdictFromProbe(await probeScanMatch(ctx.organizationId as OrgId, tracking));
    return NextResponse.json({ success: true, tracking, ...verdict });
  },
  { permission: 'receiving.view' },
);
