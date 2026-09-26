/** GET /api/kiosk/visit — device-authed visit HISTORY list (Square Transactions). */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { listKioskVisits, parseKioskVisitKind } from '@/lib/counter/list-kiosk-visits';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const params = req.nextUrl.searchParams;
  const page = await listKioskVisits(ctx.organizationId as OrgId, {
    limit: params.get('limit') == null ? undefined : Number(params.get('limit')),
    cursor: params.get('cursor'),
    q: params.get('q'),
    kind: parseKioskVisitKind(params.get('kind')),
  });

  // `relaxed` rides with the rows, never as a separate lookup: a client that
  // has to ask a second question to learn whether these are near matches is a
  // client that will paint them as exact ones for a frame.
  return NextResponse.json(
    {
      visits: page.rows,
      nextCursor: page.nextCursor,
      relaxed: page.relaxed,
      relaxedTerm: page.relaxedTerm,
    },
    { headers: NO_STORE },
  );
});
