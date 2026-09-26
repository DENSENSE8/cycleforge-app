/**
 * GET / PATCH /api/kiosk/visit/{id} — one visit, whole, for the History face.
 * switcher uses (operator 2026-09-22). Identity, not authorization: money is
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStaffActor } from '@/lib/auth/kiosk-device';
import { loadCounterVisit } from '@/lib/counter/read-visit';
import { loadVisitProvenance } from '@/lib/counter/visit-provenance';
import { visitIdFromPath } from '@/lib/counter/visit-route-path';
import {
  applyKioskVisitEdit,
  collectDisallowedEditFields,
  KIOSK_VISIT_EDITABLE_FIELDS,
} from '@/lib/counter/edit-visit';
import { recordKioskVisitAudit } from '@/lib/counter/kiosk-visit-audit';
import { AUDIT_ACTION } from '@/lib/audit-logs';
import type { OrgId } from '@/lib/tenancy/constants';
import { SERIAL_LIST_MAX_CHARS } from '@/lib/kiosk/serial-list';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

const EditSchema = z
  .object({
    staffId: z.number().int().positive(),
    customer: z
      .object({
        name: z.string().max(200).optional(),
        phone: z.string().max(40).optional(),
        email: z.string().max(200).optional(),
      })
      .optional(),
    devices: z
      .array(
        z.object({
          repairId: z.number().int().positive(),
          serialNumber: z.string().max(SERIAL_LIST_MAX_CHARS).optional(),
          issue: z.string().max(2000).optional(),
          notes: z.string().max(5000).optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .strict();

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const visitId = visitIdFromPath(req.nextUrl.pathname);
  if (visitId === null) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const orgId = ctx.organizationId as OrgId;
  const [visit, provenance] = await Promise.all([
    loadCounterVisit(orgId, visitId),
    loadVisitProvenance(orgId, { counterTransactionId: visitId }),
  ]);

  if (!visit) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json({ visit, provenance }, { headers: NO_STORE });
});

export const PATCH = withKioskAuth(async (req: NextRequest, ctx) => {
  const visitId = visitIdFromPath(req.nextUrl.pathname);
  if (visitId === null) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const raw = await req.json().catch(() => ({}));

  // Refuse BEFORE parsing: a stale tablet posting `price` must be told the
  // field is not editable here, not handed a 200 for a write that never
  // happened.
  const disallowed = collectDisallowedEditFields(raw);
  if (disallowed.length > 0) {
    return NextResponse.json(
      { error: 'FIELD_NOT_EDITABLE', fields: disallowed, editable: KIOSK_VISIT_EDITABLE_FIELDS },
      { status: 403, headers: NO_STORE },
    );
  }

  const parsed = EditSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const orgId = ctx.organizationId as OrgId;
  // PINLESS (operator 2026-09-22).
  // PINLESS (operator 2026-09-22). The tablet SIGNED IN as this staffer the
  const staffId = await resolveKioskStaffActor(orgId, parsed.data.staffId);
  if (staffId == null) {
    return NextResponse.json({ error: 'UNKNOWN_STAFF' }, { status: 403, headers: NO_STORE });
  }

  const result = await applyKioskVisitEdit(orgId, visitId, {
    customer: parsed.data.customer,
    devices: parsed.data.devices,
  });

  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'phone_conflict' ? 409 : 400;
    return NextResponse.json({ error: result.reason.toUpperCase() }, { status, headers: NO_STORE });
  }

  if (result.changed.length > 0) {
    await recordKioskVisitAudit(req, ctx, {
      action: AUDIT_ACTION.KIOSK_VISIT_EDIT,
      entityId: visitId,
      actorStaffId: staffId,
      before: result.before as unknown as Record<string, unknown>,
      after: result.after as unknown as Record<string, unknown>,
      extra: { changed: result.changed },
    });
  }

  const [visit, provenance] = await Promise.all([
    loadCounterVisit(orgId, visitId),
    loadVisitProvenance(orgId, { counterTransactionId: visitId }),
  ]);

  return NextResponse.json(
    { ok: true, changed: result.changed, visit, provenance },
    { headers: NO_STORE },
  );
});
