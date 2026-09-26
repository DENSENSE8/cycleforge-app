/** POST /api/kiosk/intake */

import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  CounterTransactionValidationError,
  submitCounterTransaction,
} from '@/lib/counter/submit-counter-transaction';
import {
  PRICE_ADJUST_KINDS,
  serviceLineCents,
  type CounterPriceAdjustment,
  type CounterTransactionInput,
  type CounterTransactionResult,
} from '@/lib/counter/counter-transaction-types';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import {
  PriceApprovalError,
  verifyLinePrices,
  verifyPriceApproval,
} from '@/lib/kiosk/price-approval';
import { catalogUnitPrices } from '@/lib/kiosk/catalog-search';
import type { OrgId } from '@/lib/tenancy/constants';
import { drainTicketWorkOutbox } from '@/lib/support/ticket-outbox';

export const runtime = 'nodejs';

/** RFC 4122 shape — what `client_event_id` (uuid) will accept. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A committed line whose price the catalog did not set — one audit row each. */
interface AdjustedLine {
  title: string;
  lineType: 'RETAIL' | 'REPAIR';
  unitAmountCents: number;
  adjustment: CounterPriceAdjustment;
}

function adjustedLines(
  lines: Pick<CounterTransactionInput, 'retailLines' | 'services'>,
): AdjustedLine[] {
  const out: AdjustedLine[] = [];
  for (const l of lines.retailLines ?? []) {
    if (l.priceAdjustment) {
      out.push({
        title: l.productTitle,
        lineType: 'RETAIL',
        unitAmountCents: l.unitAmountCents,
        adjustment: l.priceAdjustment,
      });
    }
  }
  for (const s of lines.services ?? []) {
    if (s.priceAdjustment) {
      out.push({
        title: s.productModel,
        lineType: 'REPAIR',
        unitAmountCents: serviceLineCents(s),
        adjustment: s.priceAdjustment,
      });
    }
  }
  return out;
}

/**
 * A price the catalog did not set. Only `approval` is trusted — the route
 * rebuilds kind, original, reason and staff from its verified claims.
 */
const PriceAdjustmentSchema = z
  .object({
    kind: z.enum(PRICE_ADJUST_KINDS),
    originalUnitAmountCents: z.number().int().nullable(),
    reason: z.string().trim().max(200),
    staffId: z.number().int().positive(),
    approval: z.string().min(1).max(4000),
  })
  .strict();

const RetailLineSchema = z.object({
  variationId: z.string().trim().min(1).nullable(),
  sku: z.string().trim().default(''),
  productTitle: z.string().trim().min(1),
  quantity: z.number().int().positive().max(999),
  // Negative = buyback / trade-in credit on the staged cart.
  unitAmountCents: z.number().int().min(-100_000_000).max(100_000_000),
  priceAdjustment: PriceAdjustmentSchema.nullable().optional(),
  // Square `OrderLineItem.note` caps at 2000.
  note: z.string().trim().max(2000).nullable().optional(),
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
  priceAdjustment: PriceAdjustmentSchema.nullable().optional(),
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
  /** One entry per device dropped off. */
  serviceLines: z.array(ServiceSchema).max(20).optional(),
  /**
   * Existing repairs this visit links (no intake, no signature, no ticket).
   * Ids only — the server reads each quote and device from the ticket itself,
   * so a tablet can never re-price a repair it did not take in.
   */
  linkedRepairs: z
    .array(z.object({ repairId: z.number().int().positive() }).strict())
    .max(50)
    .optional(),
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
  // What the step-up must PROVE, decided per action rather than per PIN.
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
      (parsed.data.serviceLines?.length ?? 0) > 0 ||
      (parsed.data.linkedRepairs?.length ?? 0) > 0);

  let result: CounterTransactionResult | null = null;
  /** The price-proven lines that were committed — what the per-line audits describe. */
  let committed: Pick<CounterTransactionInput, 'retailLines' | 'services'> | null = null;
  if (hasTransaction) {
    if (!idempotencyKey) {
      // Without a key a network retry would double-charge. Refuse rather than
      // mint one server-side — a server-minted key is different on every retry,
      // which is the same as having none.
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
    }
    // The key lands in `counter_transactions.client_event_id`, a UUID column, so a readable key ("retry-3") used to reach Postgres and come…
    if (!UUID_RE.test(idempotencyKey)) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_INVALID' }, { status: 400 });
    }
    // Every price on the visit, proven:
    const verifyToken = (token: string) => verifyPriceApproval(token, ctx.organizationId);
    let proven: Pick<CounterTransactionInput, 'retailLines' | 'services'>;
    try {
      proven = await verifyLinePrices(
        { retailLines: parsed.data.retailLines ?? [], services: parsed.data.serviceLines ?? [] },
        {
          verify: verifyToken,
          catalogPrices: (ids) => catalogUnitPrices(ctx.organizationId as OrgId, ids),
        },
      );
    } catch (error: unknown) {
      if (error instanceof PriceApprovalError) {
        return NextResponse.json(
          { error: 'PRICE_APPROVAL', message: `${error.lineTitle}: ${error.message}` },
          { status: 403 },
        );
      }
      throw error;
    }
    const input: CounterTransactionInput = {
      customer: {
        phone: parsed.data.customer!.phone,
        name: parsed.data.customer!.name ?? null,
        email: parsed.data.customer!.email ?? null,
        address: parsed.data.customer!.address ?? null,
      },
      retailLines: proven.retailLines,
      services: proven.services,
      linkedRepairs: parsed.data.linkedRepairs ?? [],
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
    committed = proven;
  }


  // Device-as-`via` attribution. `ctx.staffId` does not exist here — the audit
  // actor is the stepped-up staff (privileged) or nobody (anonymous base
  // intake); the device is always the `via`. Never blocks the response.
  try {
    await withTenantTransaction(ctx.organizationId, async (client) => {
      await recordAudit(client, null, req, {
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
                linked_repair_ids: (parsed.data.linkedRepairs ?? []).map((r) => r.repairId),
                staged_order_id: result.sale?.providerOrderId ?? null,
                idempotent_replay: result.idempotentReplay,
              }
            : {}),
        },
      });

      // One row per line whose price the catalog did not set — attributed to the staffer whose PIN authorized it and filed on the VISIT, where…
      // (Removing a line needs no PIN and files nothing — operator 2026-09-24.)
      if (result && committed && !result.idempotentReplay && result.counterTransactionId != null) {
        const visitId = result.counterTransactionId;
        for (const entry of adjustedLines(committed)) {
          await recordAudit(client, null, req, {
            source: 'kiosk',
            action:
              entry.adjustment.kind === 'comp'
                ? AUDIT_ACTION.COUNTER_LINE_COMP
                : AUDIT_ACTION.COUNTER_LINE_PRICE_OVERRIDE,
            entityType: AUDIT_ENTITY.COUNTER_TRANSACTION,
            entityId: visitId,
            organizationIdOverride: ctx.organizationId,
            actorStaffIdOverride: entry.adjustment.staffId,
            reasonCode: entry.adjustment.reason,
            method: 'manual',
            before: {
              title: entry.title,
              unitAmountCents: entry.adjustment.originalUnitAmountCents,
            },
            after: { title: entry.title, unitAmountCents: entry.unitAmountCents },
            extra: {
              kind: entry.adjustment.kind,
              line_type: entry.lineType,
              via: `kiosk_device:${ctx.deviceId}`,
              principal: 'kiosk',
            },
          });
        }
      }
    });
  } catch (auditErr) {
    console.warn('kiosk intake audit skipped:', auditErr);
  }

  // Mint this visit's helpdesk tickets NOW rather than on the 5-minute cron, so the receipt / drop-off paperwork the staffer prints from the…
  const visitId = result?.counterTransactionId ?? null;
  const newDevices = result && !result.idempotentReplay ? result.repairs.length : 0;
  if (visitId != null && newDevices > 0) {
    after(async () => {
      try {
        await drainTicketWorkOutbox({ counterTransactionId: visitId, batchSize: newDevices });
      } catch (drainErr) {
        console.warn('kiosk intake ticket drain deferred to cron:', drainErr);
      }
    });
  }

  return NextResponse.json({
    ok: true,
    service,
    deviceId: ctx.deviceId,
    steppedUp: steppedUpStaffId != null,
    transaction: result,
  });
});
