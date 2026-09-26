/** GET /api/kiosk/repair/{id} — one standalone repair, whole, for History. */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { loadKioskRepairHeader } from '@/lib/counter/read-repair-ticket';
import { loadVisitProvenance } from '@/lib/counter/visit-provenance';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  // `withKioskAuth` replaces Next's route context with the device principal, so
  // the handler never receives `params` — the id comes off the path, the same
  // parse `visitIdFromPath` makes for the visit family.
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('repair');
  const repairId = at === -1 ? NaN : Number(segments[at + 1]);
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const orgId = ctx.organizationId as OrgId;
  const [repair, provenance] = await Promise.all([
    loadKioskRepairHeader(orgId, repairId),
    loadVisitProvenance(orgId, { repairIds: [repairId] }),
  ]);

  if (!repair) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json({ visit: null, repair, provenance }, { headers: NO_STORE });
});
