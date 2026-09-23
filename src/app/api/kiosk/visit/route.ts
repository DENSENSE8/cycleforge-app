/**
 * GET /api/kiosk/visit — device-authed visit HISTORY list (Square Transactions).
 *
 * Callers: KioskHistoryPane master rail.
 * Affected API: this route (device cookie, `withKioskAuth`).
 * Data schemas: counter_transactions ⋈ customers ⋈ repair_service ⋈
 *   counter_transaction_lines, via `listKioskVisits`. Read-only.
 * User: "a scrollable list of the recent visits, newest first … search by
 *   phone, ticket number or last four."
 *
 * The org comes from the DEVICE row (`ctx.organizationId`), never a query
 * param — a tablet paired to org A cannot name org B here, because there is no
 * place in the contract to name an org at all.
 *
 * Paginated by keyset (`?cursor=`), capped at
 * {@link KIOSK_VISIT_PAGE_MAX}: an unbounded history fetch on a counter tablet
 * is the request that stalls the shell on a busy shop's first open.
 */

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

  return NextResponse.json(
    { visits: page.rows, nextCursor: page.nextCursor },
    { headers: NO_STORE },
  );
});
