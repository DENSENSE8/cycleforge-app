/**
 * POST /api/kiosk/repair/submit
 *
 * The HEADLESS, device-authed repair intake. Gated by `withKioskAuth` — the
 * caller is the enrolled tablet (device principal), NEVER a staff session and
 * with NO PIN step-up. A team member fills the form WITH the customer at the
 * front desk; the "employee half" (product, reasons, price, signature, optional
 * tech) is form data, not an authenticated actor.
 *
 * It shares ONE code path with the staff route (`/api/repair/submit`): both
 * call `submitRepairIntake(input, orgId)`. The repair-create logic is
 * principal-agnostic (org-scoped, body-driven), so the only difference is the
 * gate — staff permission vs device token — and this route additionally writes
 * the device-as-`via` audit row that the kiosk contract owns (see
 * `/api/kiosk/intake`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  submitRepairIntake,
  RepairIntakeValidationError,
  type SubmitRepairIntakeResult,
} from '@/lib/repair/submit-repair-intake';

export const runtime = 'nodejs';

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const idempotencyKey = req.headers.get('Idempotency-Key')?.trim() || undefined;

  let result: SubmitRepairIntakeResult;
  try {
    result = await submitRepairIntake({ ...body, idempotencyKey }, ctx.organizationId);
  } catch (error: unknown) {
    if (error instanceof RepairIntakeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error submitting kiosk repair intake:', error);
    const message = error instanceof Error ? error.message : 'Failed to submit repair form';
    return NextResponse.json({ error: message, details: message }, { status: 500 });
  }

  // Device-as-`via` attribution: no staff actor (headless), the tablet is the
  // via. Never blocks the response — recordAudit swallows its own failures.
  try {
    await withTenantTransaction(ctx.organizationId, (client) =>
      recordAudit(client, null, req, {
        source: 'kiosk',
        action: AUDIT_ACTION.KIOSK_INTAKE,
        entityType: AUDIT_ENTITY.KIOSK_DEVICE,
        entityId: ctx.deviceId,
        organizationIdOverride: ctx.organizationId,
        actorStaffIdOverride: null,
        extra: {
          via: `kiosk_device:${ctx.deviceId}`,
          device_label: ctx.deviceLabel,
          principal: 'kiosk',
          service: 'repair',
          stepped_up: false,
          repair_id: result.id,
          rs_number: result.rsNumber,
        },
      }),
    );
  } catch (auditErr) {
    console.warn('kiosk repair intake audit skipped:', auditErr);
  }

  return NextResponse.json(result);
});
