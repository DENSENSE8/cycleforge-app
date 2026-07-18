/**
 * POST /api/kiosk/intake
 *
 * The device-authed write path. Gated by `withKioskAuth` — the caller is the
 * enrolled tablet (device principal), NEVER a staff session. The intake is
 * created under the device's own org via `withTenantTransaction`, so the write
 * is tenant-stamped and RLS-scoped.
 *
 * PIN STEP-UP (privileged actions): base intake is anonymous (the device
 * authorizes it). A privileged action (refund / repair approval / price
 * override) includes a `staffId` + `pin`; we resolve the real `staffId` via the
 * existing PIN primitive and attribute the audit row to that person, keeping
 * the `deviceId` as the `via`. Nothing is ever attributed to a shared human
 * account — the whole point of the device-principal model.
 *
 * SEAM (doc 03): the real intake persistence + Square/Zoho/Ecwid capability-
 * facade calls replace the audit-only body below. The AUTH contract — device
 * principal, tenant transaction, PIN step-up attribution — is what this route
 * owns and doc 03 composes on top of.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

export const runtime = 'nodejs';

const BodySchema = z.object({
  service: z.enum(['sales', 'pickup', 'repair']),
  note: z.string().trim().max(2000).optional(),
  /** Present only for a privileged action requiring staff step-up. */
  staffId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', issues: parsed.error.issues }, { status: 400 });
  }
  const { service, note, staffId, pin } = parsed.data;

  // A privileged action presents a staff PIN. Resolve it (org-scoped) into the
  // real staffId the write is attributed to. A bad PIN is a hard 403 — never a
  // silent fall-through to an anonymous write.
  const stepUpAttempted = staffId != null || (pin != null && pin !== '');
  let steppedUpStaffId: number | null = null;
  if (stepUpAttempted) {
    if (staffId == null || !pin) {
      return NextResponse.json({ error: 'STEPUP_INCOMPLETE' }, { status: 400 });
    }
    steppedUpStaffId = await resolveKioskStepUp(ctx.organizationId, staffId, pin);
    if (steppedUpStaffId == null) {
      return NextResponse.json({ error: 'STEPUP_FAILED' }, { status: 403 });
    }
  }

  // The write runs under the device principal, tenant-scoped. `ctx.staffId`
  // does not exist here — the audit actor is the stepped-up staff (privileged)
  // or nobody (anonymous base intake); the device is always the `via`.
  await withTenantTransaction(ctx.organizationId, (client) =>
    recordAudit(client, null, req, {
      source: 'kiosk',
      action: AUDIT_ACTION.KIOSK_INTAKE,
      entityType: AUDIT_ENTITY.KIOSK_DEVICE,
      entityId: ctx.deviceId,
      organizationIdOverride: ctx.organizationId,
      actorStaffIdOverride: steppedUpStaffId,
      note,
      extra: {
        via: `kiosk_device:${ctx.deviceId}`,
        device_label: ctx.deviceLabel,
        principal: 'kiosk',
        service,
        stepped_up: steppedUpStaffId != null,
      },
    }),
  );

  return NextResponse.json({
    ok: true,
    service,
    deviceId: ctx.deviceId,
    steppedUp: steppedUpStaffId != null,
  });
});
