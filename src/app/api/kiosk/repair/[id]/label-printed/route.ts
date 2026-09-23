/**
 * POST /api/kiosk/repair/{id}/label-printed — device-authed reprint stamp for a
 * repair that never became a counter transaction.
 *
 * Callers: KioskHistoryDetail "Reprint label" on a `repair:` row (after
 * `printRepairLabel` has already opened the print dialog).
 * Affected API: this route (device cookie + the pinless staff sign-in).
 * Data schemas: repair_service.label_printed_at (first print wins).
 * User 2026-09-23: *"It must have action buttons for printing out a label if
 * you need to reprint out the same label."*
 *
 * ## Why this exists beside the visit twin
 *
 * `/api/kiosk/visit/[id]/label-printed` scopes the write by requiring the
 * repair to belong to the visit on screen. Most repairs in this org have NO
 * visit — Ecwid drop-offs, inbound shipments, desk tickets — so that check can
 * never pass for them and the tablet had no way to stamp a reprint at all.
 *
 * The scope this route puts in its place is the same one the History list
 * already grants: org membership. A device that can list and open this ticket
 * can print its label, and the stamp is monotonic (`markRepairLabelPrinted`
 * writes only when NULL — a reprint never moves the first-print instant) and
 * audited against the repair itself. Nothing here moves money or status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStaffActor } from '@/lib/auth/kiosk-device';
import { recordKioskVisitAudit } from '@/lib/counter/kiosk-visit-audit';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { markRepairLabelPrinted } from '@/lib/neon/repair-service-queries';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

const BodySchema = z.object({ staffId: z.number().int().positive() }).strict();

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  // `withKioskAuth` replaces Next's route context, so the handler never
  // receives `params`. The final segment here is `label-printed` — take the one
  // after `repair`, never the last.
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('repair');
  const repairId = at === -1 ? NaN : Number(segments[at + 1]);
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
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

  // Org membership, asserted before the write rather than inferred from it —
  // `markRepairLabelPrinted` is org-scoped too, but a 404 that already told the
  // caller "this id is not yours" is the answer a cross-tenant probe gets.
  const owned = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT id FROM repair_service WHERE organization_id = $1 AND id = $2 LIMIT 1`,
    [orgId, repairId],
  );
  if (!owned.rows[0]) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  const result = await markRepairLabelPrinted(repairId, orgId);
  if (!result.ok) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  await invalidateCacheTags(orgId, ['repair-service']);
  await publishRepairChanged({
    organizationId: orgId,
    repairIds: [repairId],
    source: 'kiosk.history.label-printed',
  });

  await recordKioskVisitAudit(req, ctx, {
    action: AUDIT_ACTION.KIOSK_VISIT_PRINT,
    entityType: AUDIT_ENTITY.REPAIR_SERVICE,
    entityId: repairId,
    actorStaffId: staffId,
    extra: { kind: 'label', repair_id: repairId, reprint: result.alreadyPrinted },
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
