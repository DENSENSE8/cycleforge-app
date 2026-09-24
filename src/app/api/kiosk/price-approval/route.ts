/**
 * POST /api/kiosk/price-approval
 *
 * The counter tablet's PIN step-up for a line's money verbs — Square's "Price
 * adjustment", "Keypad" (custom amount) and "Comp". Device-authed
 * (`withKioskAuth`); the PERSON is proven by `resolveKioskStepUp` against
 * `walk_in.adjust_price`, never by the device.
 *
 * Answers a signed approval (`lib/kiosk/price-approval`) naming exactly what
 * was authorized. The tablet has no server session mid-cart, so the approval
 * rides the cart line and `/api/kiosk/intake` verifies it at submit, where the
 * adjustment is persisted and audited against the visit it belongs to — so
 * this route writes nothing itself. Removing a line needs no approval at all
 * (operator 2026-09-24: "no need for PIN to remove — dogfood must move fast").
 *
 * Callers: `KioskCartLineEditor`.
 * Schemas: none (read-only step-up).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import { signPriceApproval } from '@/lib/kiosk/price-approval';
import { PRICE_ADJUST_KINDS } from '@/lib/counter/counter-transaction-types';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const CENTS = z.number().int().min(-100_000_000).max(100_000_000);

const BodySchema = z
  .object({
    staffId: z.number().int().positive(),
    pin: z.string().min(1).max(32),
    kind: z.enum(PRICE_ADJUST_KINDS),
    fromCents: CENTS.nullable(),
    toCents: CENTS,
    reason: z.string().trim().min(1).max(200),
  })
  .strict()
  .refine((b) => b.kind !== 'custom' || b.fromCents === null, {
    message: 'A custom amount has no catalog price to start from.',
  })
  .refine((b) => b.kind !== 'comp' || b.toCents === 0, {
    message: 'A comp leaves the line at $0.',
  });

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', issues: parsed.error.issues }, { status: 400 });
  }
  const { staffId, pin, kind, fromCents, toCents, reason } = parsed.data;
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

  return NextResponse.json(
    { approval: token, staffId: approver, expiresAt: new Date(claims.expiresAt * 1_000).toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
});
