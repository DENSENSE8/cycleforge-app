/**
 * POST /api/kiosk/price-approval
 *
 * The counter tablet's PIN step-up for a line's money verbs — Square's "Price
 * adjustment", "Keypad" (custom amount), "Comp" and "Void". Device-authed
 * (`withKioskAuth`); the PERSON is proven by `resolveKioskStepUp` against
 * `walk_in.adjust_price`, never by the device.
 *
 * Answers a signed approval (`lib/kiosk/price-approval`) naming exactly what
 * was authorized. The tablet has no server session mid-cart, so the approval
 * rides the cart line and `/api/kiosk/intake` verifies it at submit, where the
 * adjustment is persisted and audited against the visit it belongs to.
 *
 * A VOID is audited HERE, because nothing later is guaranteed: Clear cart
 * ends the visit without a submit, and a void that left no row would be a
 * line the customer saw vanishing with no trace.
 *
 * Callers: `KioskCartLineEditor`, `KioskCartLedger`.
 * Schemas: `audit_logs` (void only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { signPriceApproval } from '@/lib/kiosk/price-approval';
import { PRICE_APPROVAL_KINDS } from '@/lib/kiosk/price-approval-kinds';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const CENTS = z.number().int().min(-100_000_000).max(100_000_000);

const BodySchema = z
  .object({
    staffId: z.number().int().positive(),
    pin: z.string().min(1).max(32),
    kind: z.enum(PRICE_APPROVAL_KINDS),
    fromCents: CENTS.nullable(),
    toCents: CENTS,
    reason: z.string().trim().min(1).max(200),
    /** What the line was — the void's audit row names it; ignored otherwise. */
    lines: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(300),
            quantity: z.number().int().min(0).max(999),
            unitAmountCents: CENTS,
          })
          .strict(),
      )
      .max(200)
      .optional(),
  })
  .strict()
  .refine((b) => b.kind !== 'custom' || b.fromCents === null, {
    message: 'A custom amount has no catalog price to start from.',
  })
  .refine((b) => (b.kind !== 'comp' && b.kind !== 'void') || b.toCents === 0, {
    message: 'A comp or a void leaves the line at $0.',
  })
  .refine((b) => b.kind !== 'void' || (b.lines?.length ?? 0) > 0, {
    message: 'A void names the lines it removes.',
  });

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', issues: parsed.error.issues }, { status: 400 });
  }
  const { staffId, pin, kind, fromCents, toCents, reason, lines } = parsed.data;
  const orgId = ctx.organizationId as OrgId;

  const approver = await resolveKioskStepUp(orgId, staffId, pin, 'walk_in.adjust_price');
  if (approver == null) {
    // Oracle-safe: a wrong PIN and a PIN without the permission read the same.
    return NextResponse.json({ error: 'STEPUP_FAILED', message: 'PIN incorrect' }, { status: 403 });
  }

  const { token, claims } = signPriceApproval({
    organizationId: ctx.organizationId,
    staffId: approver,
    kind,
    fromCents,
    toCents,
    reason,
  });

  if (kind === 'void') {
    ctx.markAuditWritten();
    await withTenantTransaction(orgId, (client) =>
      recordAudit(client, null, req, {
        source: 'kiosk',
        action: AUDIT_ACTION.COUNTER_LINE_VOID,
        entityType: AUDIT_ENTITY.KIOSK_DEVICE,
        entityId: ctx.deviceId,
        organizationIdOverride: ctx.organizationId,
        actorStaffIdOverride: approver,
        reasonCode: reason,
        method: 'manual',
        before: { lines: lines ?? [] },
        after: null,
        extra: {
          via: `kiosk_device:${ctx.deviceId}`,
          device_label: ctx.deviceLabel,
          principal: 'kiosk',
        },
      }),
    );
  }

  return NextResponse.json(
    { approval: token, staffId: approver, expiresAt: new Date(claims.expiresAt * 1_000).toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
});
