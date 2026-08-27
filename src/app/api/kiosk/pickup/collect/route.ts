/**
 * POST /api/kiosk/pickup/collect
 *
 * Mark a looked-up repair as collected (Done). Device-authed; optional staff
 * PIN step-up for attribution. Re-validates order# + phone so the tablet
 * cannot collect an id it never proved with the two-key lookup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { collectKioskOrderPickup } from '@/lib/kiosk/order-pickup';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  repairId: z.number().int().positive(),
  phone: z.string().trim().min(7).max(32),
  staffId: z.number().int().positive().optional(),
  pin: z.string().optional(),
  signerName: z.string().trim().max(200).nullable().optional(),
  signatureDataUrl: z.string().nullable().optional(),
  declinedReason: z.string().trim().max(500).nullable().optional(),
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { staffId, pin } = parsed.data;
  const stepUpAttempted = staffId != null || (pin != null && pin !== '');
  let steppedUpStaffId: number | null = null;
  if (stepUpAttempted) {
    if (staffId == null || !pin) {
      return NextResponse.json({ error: 'STEPUP_INCOMPLETE' }, { status: 400 });
    }
    steppedUpStaffId = await resolveKioskStepUp(
      ctx.organizationId,
      staffId,
      pin,
      null,
    );
    if (steppedUpStaffId == null) {
      return NextResponse.json({ error: 'STEPUP_FAILED' }, { status: 403 });
    }
  }

  const result = await collectKioskOrderPickup(ctx.organizationId as OrgId, {
    repairId: parsed.data.repairId,
    phone: parsed.data.phone,
    deviceId: ctx.deviceId,
    staffId: steppedUpStaffId,
    signerName: parsed.data.signerName ?? null,
    signatureDataUrl: parsed.data.signatureDataUrl ?? null,
    declinedReason: parsed.data.declinedReason ?? null,
  });

  if (!result.ok) {
    const status = result.reason === 'already_collected' ? 409 : 404;
    return NextResponse.json(
      {
        error:
          result.reason === 'already_collected'
            ? 'ALREADY_COLLECTED'
            : 'NOT_FOUND',
      },
      { status },
    );
  }

  try {
    await withTenantTransaction(ctx.organizationId, (client) =>
      recordAudit(client, null, req, {
        source: 'kiosk',
        action: AUDIT_ACTION.KIOSK_PICKUP_COLLECT,
        entityType: AUDIT_ENTITY.KIOSK_DEVICE,
        entityId: ctx.deviceId,
        organizationIdOverride: ctx.organizationId,
        actorStaffIdOverride: steppedUpStaffId,
        extra: {
          via: `kiosk_device:${ctx.deviceId}`,
          device_label: ctx.deviceLabel,
          principal: 'kiosk',
          repair_id: result.summary.repairId,
          ticket_number: result.summary.ticketNumber,
          stepped_up: steppedUpStaffId != null,
        },
      }),
    );
  } catch (auditErr) {
    console.warn('kiosk pickup collect audit skipped:', auditErr);
  }

  return NextResponse.json(
    { summary: result.summary },
    { headers: { 'cache-control': 'no-store' } },
  );
});
