/**
 * POST /api/kiosk/visit/{id}/label-printed — device-authed reprint stamp for
 * one repair label.
 *
 * Callers: KioskHistoryPane "Print label" (after `printRepairLabel`).
 * Affected API: this route (device cookie + the pinless staff sign-in).
 * Data schemas: repair_service.label_printed_at (first print wins).
 * User: "print the label again" — and the plan's rule that *a reprint that
 * does not record itself is a lie.*
 *
 * ## Why not the staff route
 *
 * `POST /api/repair-service/[id]/label-printed` is `requireRoutePerm(
 * 'repair.intake')` and 401s on a tablet, which has no staff session. This is
 * its device-principal twin and it calls the SAME domain helper
 * (`markRepairLabelPrinted`) — there is one stamp implementation, not two.
 *
 * ## Why it hangs off the VISIT, not the repair
 *
 * The id in the path is the visit the History face has open, and the repair
 * must be one of THAT visit's devices. A bare `/api/kiosk/repair/{id}/…`
 * would let any device-authed caller walk the whole repair book by id; here
 * the visit scopes the blast radius to the paper already on screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStaffActor } from '@/lib/auth/kiosk-device';
import { visitIdFromPath } from '@/lib/counter/visit-route-path';
import { recordKioskVisitAudit } from '@/lib/counter/kiosk-visit-audit';
import { AUDIT_ACTION } from '@/lib/audit-logs';
import { markRepairLabelPrinted } from '@/lib/neon/repair-service-queries';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

const BodySchema = z
  .object({
    repairId: z.number().int().positive(),
    staffId: z.number().int().positive(),
  })
  .strict();

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const visitId = visitIdFromPath(req.nextUrl.pathname);
  if (visitId === null) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const orgId = ctx.organizationId as OrgId;
  // PINLESS (operator 2026-09-22) — the tablet signed in as this staffer the
  // same way the desk switcher does. The id names the ACTOR on the audit row;
  // it authorizes nothing beyond what the device already could do.
  const staffId = await resolveKioskStaffActor(orgId, parsed.data.staffId);
  if (staffId == null) {
    return NextResponse.json({ error: 'UNKNOWN_STAFF' }, { status: 403, headers: NO_STORE });
  }

  const owned = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT id
       FROM repair_service
      WHERE organization_id = $1 AND id = $2 AND counter_transaction_id = $3
      LIMIT 1`,
    [orgId, parsed.data.repairId, visitId],
  );
  if (!owned.rows[0]) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  const result = await markRepairLabelPrinted(parsed.data.repairId, orgId);
  if (!result.ok) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  await invalidateCacheTags(orgId, ['repair-service']);
  await publishRepairChanged({
    organizationId: orgId,
    repairIds: [parsed.data.repairId],
    source: 'kiosk.history.label-printed',
  });

  await recordKioskVisitAudit(req, ctx, {
    action: AUDIT_ACTION.KIOSK_VISIT_PRINT,
    entityId: visitId,
    actorStaffId: staffId,
    extra: {
      kind: 'label',
      repair_id: parsed.data.repairId,
      reprint: result.alreadyPrinted,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      labelPrintedAt: result.repair.label_printed_at ?? null,
      alreadyPrinted: result.alreadyPrinted,
    },
    { headers: NO_STORE },
  );
});
