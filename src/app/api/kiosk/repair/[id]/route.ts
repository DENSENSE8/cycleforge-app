/**
 * GET /api/kiosk/repair/{id} — one standalone repair, whole, for History.
 *
 * Callers: `KioskHistoryPane`'s detail pane, for a rail row whose `source` is
 * `repair` (a ticket with no `counter_transaction_id`).
 * Affected API: this route (device cookie, `withKioskAuth`).
 * Data schemas: `loadKioskRepairHeader` (ticket, quote, customer, provenance of
 *   arrival) and `loadVisitProvenance({ repairIds })` — the SAME device section
 *   a visit-backed repair gets.
 * User 2026-09-23: *"if I were to create a repair service it will then show up
 *   in the history tab so I would be able to view it."*
 *
 * The device twin of `/api/kiosk/visit/[id]`, and it is a READ only: a ticket
 * that never became a transaction has no receipt to reprint and no visit to
 * edit, so this route offers neither. Label reprint stays on the visit route,
 * which is where the repair→visit ownership check lives.
 *
 * Device-authed with no sign-in, for the same reason the visit detail is: the
 * FACE asks who you are (History refuses to mount on the customer posture),
 * and this read grants nothing the tablet could not already print.
 */

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
