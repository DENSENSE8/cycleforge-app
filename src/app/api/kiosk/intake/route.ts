/**
 * POST /api/kiosk/intake
 *
 * The ONE device-authed counter write path. Gated by `withKioskAuth` — the
 * caller is the enrolled tablet (device principal), NEVER a staff session. The
 * write runs under the device's own org, so it is tenant-stamped and RLS-scoped.
 *
 * PIN STEP-UP (privileged actions): base intake is anonymous (the device
 * authorizes it). A privileged action (refund / repair approval / price
 * override / taking payment) includes a `staffId` + `pin`; we resolve the real
 * `staffId` via the existing PIN primitive and attribute the audit row to that
 * person, keeping the `deviceId` as the `via`. Nothing is ever attributed to a
 * shared human account — the whole point of the device-principal model.
 *
 * The audit contract above is what this route OWNS and is deliberately unchanged
 * from the audit-only stub it replaced: it was the proven half of this system.
 * What changed is the body — persistence now runs through
 * `submitCounterTransaction`, the principal-agnostic orchestrator a staff caller
 * invokes identically.
 *
 * NEVER charges. The orchestrator stages a provider order and stops; payment
 * completes on a physical terminal or behind a step-up. No card data is accepted
 * here under any framing.
 *
 * `/api/kiosk/repair/submit` is still live and still the client's path until the
 * kiosk UI is repointed — retiring it is the last step of phase 05, not this one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  CounterTransactionValidationError,
  submitCounterTransaction,
} from '@/lib/counter/submit-counter-transaction';
import type {
  CounterTransactionInput,
  CounterTransactionResult,
} from '@/lib/counter/counter-transaction-types';
import type { PermissionString } from '@/lib/auth/permissions-shared';

export const runtime = 'nodejs';

const RetailLineSchema = z.object({
  variationId: z.string().trim().min(1).nullable(),
  sku: z.string().trim().default(''),
  productTitle: z.string().trim().min(1),
  quantity: z.number().int().positive().max(999),
  // Negative = buyback / trade-in credit on the staged cart.
  unitAmountCents: z.number().int().min(-100_000_000).max(100_000_000),
});

const ServiceSchema = z.object({
  productType: z.string().trim().nullable().optional(),
  productModel: z.string().trim().min(1),
  sourceSku: z.string().trim().nullable().optional(),
  repairReasons: z.array(z.string().trim()).optional(),
  repairNotes: z.string().trim().max(4000).nullable().optional(),
  serialNumber: z.string().trim().min(1),
  price: z.string().trim().min(1),
  notes: z.string().trim().max(4000).nullable().optional(),
  assignedTechId: z.number().int().positive().nullable().optional(),
  signatureDataUrl: z.string().nullable().optional(),
  signatureStrokes: z.unknown().optional(),
});

const BodySchema = z.object({
  service: z.enum(['sales', 'pickup', 'repair']),
  note: z.string().trim().max(2000).optional(),
  /** Present only for a privileged action requiring staff step-up. */
  staffId: z.number().int().positive().optional(),
  pin: z.string().optional(),
  /**
   * The operator is handing off to payment. Requires a step-up by someone
   * holding `walk_in.take_payment` — never authorized by the device alone.
   * This still only STAGES: no card data is accepted here under any framing.
   */
  takePayment: z.boolean().optional(),

  // ── The counter transaction ──
  customer: z
    .object({
      phone: z.string().trim().min(1),
      name: z.string().trim().nullable().optional(),
      email: z.string().trim().nullable().optional(),
      // Callers: KioskCartLedger. API: POST /api/kiosk/intake. Schema: CounterCustomerInput. User: "intake their information like name, email address, phone number, address"
      address: z.string().trim().max(400).nullable().optional(),
    })
    .optional(),
  retailLines: z.array(RetailLineSchema).max(200).optional(),
  /**
   * One entry per device dropped off. Was `serviceLine` (singular) until
   * 2026-08-21 — the orchestrator kept only the first and the rest vanished.
   *
   * The schema is `.strict()` (below) SPECIFICALLY because of this rename. A
   * plain `z.object` STRIPS unknown keys: a tablet still running the old build
   * would post `serviceLine`, have it silently removed, and stage a retail sale
   * with the customer's device recorded nowhere — while showing them a success
   * screen. Verified against this repo's zod: `{serviceLine: {...}}` parses to
   * `{success: true, data: {}}`.
   */
  serviceLines: z.array(ServiceSchema).max(20).optional(),
  priorOrder: z
    .object({ orderNumber: z.string().trim().min(1), phone: z.string().trim().min(1) })
    .nullable()
    .optional(),
  ticketWork: z
    .union([
      z.object({ mode: z.literal('none') }),
      z.object({ mode: z.literal('create') }),
      z.object({ mode: z.literal('attach'), ticketId: z.number().int().positive() }),
    ])
    .optional(),
})
  // STRICT: an unknown key is a stale client, not noise to discard. Without
  // this, an old tablet's `serviceLine` is stripped and the visit stages a sale
  // with the customer's device recorded nowhere.
  .strict();

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    // Name the stale-client case specifically: an operator seeing
    // "Transaction failed" reloads nothing, and the device stays unrecorded.
    const unknownKeys = parsed.error.issues.some((i) => i.code === 'unrecognized_keys');
    if (unknownKeys) {
      return NextResponse.json(
        { error: 'STALE_CLIENT', message: 'This tablet is running an old build — reload it.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'INVALID_REQUEST', issues: parsed.error.issues }, { status: 400 });
  }
  const { service, note, staffId, pin } = parsed.data;

  // A privileged action presents a staff PIN. Resolve it (org-scoped) into the
  // real staffId the write is attributed to. A bad PIN is a hard 403 — never a
  // silent fall-through to an anonymous write.
  const stepUpAttempted = staffId != null || (pin != null && pin !== '');
  // What the step-up must PROVE, decided per action rather than per PIN. A
  // payment hand-off requires someone who holds `walk_in.take_payment`; a
  // non-payment step-up (a price note, an override) needs only a valid PIN, and
  // that `null` is written out so the choice is visible rather than defaulted.
  const stepUpPermission: PermissionString | null =
    parsed.data.takePayment === true ? 'walk_in.take_payment' : null;
  let steppedUpStaffId: number | null = null;
  if (stepUpAttempted) {
    if (staffId == null || !pin) {
      return NextResponse.json({ error: 'STEPUP_INCOMPLETE' }, { status: 400 });
    }
    steppedUpStaffId = await resolveKioskStepUp(
      ctx.organizationId,
      staffId,
      pin,
      stepUpPermission,
    );
    if (steppedUpStaffId == null) {
      return NextResponse.json({ error: 'STEPUP_FAILED' }, { status: 403 });
    }
  }

  // Taking payment is not something a device may authorize on its own.
  if (parsed.data.takePayment === true && steppedUpStaffId == null) {
    return NextResponse.json({ error: 'STEPUP_REQUIRED_FOR_PAYMENT' }, { status: 403 });
  }

  // The idempotency anchor for the WHOLE transaction. The client already mints
  // one per submission and re-sends it on retry.
  const idempotencyKey = req.headers.get('Idempotency-Key')?.trim() || '';
  const hasTransaction =
    !!parsed.data.customer &&
    ((parsed.data.retailLines?.length ?? 0) > 0 ||
      (parsed.data.serviceLines?.length ?? 0) > 0);

  let result: CounterTransactionResult | null = null;
  if (hasTransaction) {
    if (!idempotencyKey) {
      // Without a key a network retry would double-charge. Refuse rather than
      // mint one server-side — a server-minted key is different on every retry,
      // which is the same as having none.
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
    }
    const input: CounterTransactionInput = {
      customer: {
        phone: parsed.data.customer!.phone,
        name: parsed.data.customer!.name ?? null,
        email: parsed.data.customer!.email ?? null,
        address: parsed.data.customer!.address ?? null,
      },
      retailLines: parsed.data.retailLines ?? [],
      services: parsed.data.serviceLines ?? [],
      priorOrder: parsed.data.priorOrder ?? null,
      ticketWork: parsed.data.ticketWork ?? { mode: 'none' },
      clientEventId: idempotencyKey,
      kioskDeviceId: ctx.deviceId,
      steppedUpStaffId,
    };
    try {
      result = await submitCounterTransaction(input, ctx.organizationId);
    } catch (error: unknown) {
      if (error instanceof CounterTransactionValidationError) {
        return NextResponse.json({ error: error.message, missing: error.missing }, { status: 400 });
      }
      console.error('POST /api/kiosk/intake failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to submit';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Device-as-`via` attribution. `ctx.staffId` does not exist here — the audit
  // actor is the stepped-up staff (privileged) or nobody (anonymous base
  // intake); the device is always the `via`. Never blocks the response.
  try {
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
          ...(result
            ? {
                counter_transaction_id: result.counterTransactionId,
                counter_status: result.status,
                repair_ids: result.repairs.map((r) => r.id),
                rs_numbers: result.repairs.map((r) => r.rsNumber),
                staged_order_id: result.sale?.providerOrderId ?? null,
                idempotent_replay: result.idempotentReplay,
              }
            : {}),
        },
      }),
    );
  } catch (auditErr) {
    console.warn('kiosk intake audit skipped:', auditErr);
  }

  return NextResponse.json({
    ok: true,
    service,
    deviceId: ctx.deviceId,
    steppedUp: steppedUpStaffId != null,
    transaction: result,
  });
});
