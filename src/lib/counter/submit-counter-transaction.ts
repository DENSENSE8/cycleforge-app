/**
 * submitCounterTransaction — the ONE counter-visit write path, as a
 * principal-agnostic domain helper.
 *
 * Everything here is scoped by `orgId` + the submitted input; NOTHING depends on
 * a staff actor. That is deliberate and it is the single most important
 * structural constraint in this feature: a staff caller and a kiosk device
 * caller invoke the identical helper, so the two surfaces can never drift.
 *
 *   resolveCounterCustomer()      deterministic identity (phone only)
 *     → counter_transactions      the header + the idempotency anchor
 *     → submitRepairIntake(...)   COMPOSED, UNMODIFIED
 *     → stageSquareOrder(...)     staged, NEVER charged
 *     → enqueueTicketWork(...)    the outbox
 *
 * ## submitRepairIntake is composed, never re-inlined
 *
 * `src/lib/repair/submit-repair-intake.ts` was extracted specifically so the
 * staff route (`/api/repair/submit`) and the device route both share one
 * org-scoped create path. Copying its body in here would recreate the exact fork
 * it exists to prevent, so this module treats it as a black box: it goes in
 * through the published input and comes out through the published result.
 *
 * ## The kiosk stages, it never charges
 *
 * `stageSquareOrder` creates a provider order and STOPS. Payment completes on a
 * physical terminal or behind a staff PIN step-up. No card data is entered,
 * accepted, or forwarded anywhere in this path, under any framing.
 *
 * ## Partial failure is designed for, not hoped against
 *
 * | Case                          | Behavior                                        |
 * |-------------------------------|-------------------------------------------------|
 * | Repair declined, retail sold  | header carries no repair link                    |
 * | Sale staged, repair fails     | header stays `partially_paid`, reconcilable      |
 * | Helpdesk down                 | outbox absorbs it; the counter is never blocked |
 * | Any sub-write fails           | the signed agreement survives (ON DELETE SET NULL) |
 */

import { confirmOrderNumberForPhone } from '@/lib/ecwid/client';
import { createRepairCustomer } from '@/lib/neon/customer-queries';
import {
  RepairIntakeValidationError,
  submitRepairIntake,
} from '@/lib/repair/submit-repair-intake';
import { squareFetchForOrg } from '@/lib/square/server';
import { enqueueTicketWork } from '@/lib/support/ticket-outbox';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  computeCounterTotals,
  type CounterRetailLine,
  type CounterTransactionInput,
  type CounterTransactionResult,
  type CounterTransactionStatus,
} from './counter-transaction-types';

/** Thrown when the input cannot describe a transaction at all. Callers map → 400. */
export class CounterTransactionValidationError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing required fields: ${missing.join(', ')}`);
    this.name = 'CounterTransactionValidationError';
    this.missing = missing;
  }
}

interface ResolvedCustomer {
  id: number;
  /**
   * The phone string AS STORED on the customer row. Threaded into
   * `submitRepairIntake` so its own `findOrCreateRepairCustomer` phone lookup —
   * which is an exact string match — hits this same row. See the note in
   * {@link SubmitCounterTransactionDeps.findCustomerByPhoneDigits}.
   */
  storedPhone: string;
  /**
   * The name already on file. A returning customer who only types their phone
   * still needs a real name on the repair record and the signed agreement — the
   * phone number is not a name.
   */
  storedName: string;
}

interface HeaderRow {
  id: number;
  status: CounterTransactionStatus;
  customerId: number | null;
  priorOrderRef: string | null;
  stagedSquareOrderId: string | null;
  subtotalCents: number;
  totalCents: number;
}

export interface SubmitCounterTransactionDeps {
  /**
   * Match an existing customer on the TRAILING DIGITS of the phone, org-scoped.
   *
   * Why not `findOrCreateRepairCustomer`: that helper matches phone → **name** →
   * create, and a bare name match silently merges two different "John Smith"s
   * onto one record. At a counter that is a stranger's repair history attached
   * to the wrong person. This path is phone-only; on a miss it CREATES rather
   * than falling through to the name branch.
   *
   * Resolving identity here first also neutralizes the hazard inside
   * `submitRepairIntake`: by the time it runs its own lookup, a row with this
   * exact phone exists, so its phone branch hits and its name branch is
   * unreachable.
   */
  findCustomerByPhoneDigits(orgId: OrgId, phoneDigits: string): Promise<ResolvedCustomer | null>;
  createCustomer(
    orgId: OrgId,
    args: { name: string; phone: string; email?: string },
  ): Promise<ResolvedCustomer>;

  /** The header for this client_event_id, if this submit is a replay. */
  findHeaderByClientEvent(orgId: OrgId, clientEventId: string): Promise<HeaderRow | null>;
  insertHeader(
    orgId: OrgId,
    args: {
      customerId: number;
      kioskDeviceId: number | null;
      priorOrderRef: string | null;
      subtotalCents: number;
      totalCents: number;
      clientEventId: string;
    },
  ): Promise<HeaderRow>;
  patchHeader(
    orgId: OrgId,
    headerId: number,
    patch: { status?: CounterTransactionStatus; stagedSquareOrderId?: string | null },
  ): Promise<void>;

  /** COMPOSED, never re-implemented. */
  submitRepair: typeof submitRepairIntake;
  linkRepairToHeader(orgId: OrgId, repairId: number, headerId: number): Promise<void>;

  /** Creates a provider order and stops. Null when no provider is connected. */
  stageOrder(
    orgId: OrgId,
    lines: CounterRetailLine[],
    idempotencyKey: string,
  ): Promise<{ providerOrderId: string; totalCents: number | null } | null>;

  /** Two-key prior-order confirmation. Null on any disagreement. */
  confirmPriorOrder(args: {
    orgId: OrgId;
    orderNumber: string;
    phone: string;
  }): Promise<string | null>;

  enqueueTicket: typeof enqueueTicketWork;
}

/** Trailing N digits of a phone, formatting-insensitive. */
function lastDigits(value: string | null | undefined, n = 10): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length <= n ? digits : digits.slice(-n);
}

const defaultDeps: SubmitCounterTransactionDeps = {
  async findCustomerByPhoneDigits(orgId, phoneDigits) {
    const res = await tenantQuery<{ id: number; phone: string | null; name: string | null }>(
      orgId,
      `SELECT id,
              phone,
              COALESCE(
                NULLIF(display_name, ''),
                NULLIF(customer_name, ''),
                NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
              ) AS name
         FROM customers
        WHERE organization_id = $1
          AND phone IS NOT NULL
          AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [orgId, phoneDigits],
    );
    const row = res.rows[0];
    return row
      ? { id: Number(row.id), storedPhone: row.phone ?? '', storedName: row.name ?? '' }
      : null;
  },

  async createCustomer(orgId, args) {
    const created = await createRepairCustomer(args, orgId);
    return {
      id: created.id,
      storedPhone: created.phone ?? args.phone,
      storedName:
        created.display_name?.trim() || created.customer_name?.trim() || args.name,
    };
  },

  async findHeaderByClientEvent(orgId, clientEventId) {
    const res = await tenantQuery<Record<string, unknown>>(
      orgId,
      `SELECT id, status, customer_id, prior_order_ref, staged_square_order_id,
              subtotal_cents, total_cents
         FROM counter_transactions
        WHERE organization_id = $1 AND client_event_id = $2::uuid
        LIMIT 1`,
      [orgId, clientEventId],
    );
    return res.rows[0] ? toHeaderRow(res.rows[0]) : null;
  },

  async insertHeader(orgId, args) {
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `INSERT INTO counter_transactions
           (organization_id, customer_id, kiosk_device_id, prior_order_ref,
            subtotal_cents, total_cents, status, client_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'staged', $7::uuid)
         RETURNING id, status, customer_id, prior_order_ref, staged_square_order_id,
                   subtotal_cents, total_cents`,
        [
          orgId,
          args.customerId,
          args.kioskDeviceId,
          args.priorOrderRef,
          args.subtotalCents,
          args.totalCents,
          args.clientEventId,
        ],
      );
      return toHeaderRow(res.rows[0]);
    });
  },

  async patchHeader(orgId, headerId, patch) {
    const sets: string[] = ['updated_at = now()'];
    const values: unknown[] = [orgId, headerId];
    let i = 3;
    if (patch.status !== undefined) {
      sets.push(`status = $${i++}`);
      values.push(patch.status);
    }
    if (patch.stagedSquareOrderId !== undefined) {
      sets.push(`staged_square_order_id = $${i++}`);
      values.push(patch.stagedSquareOrderId);
    }
    await tenantQuery(
      orgId,
      `UPDATE counter_transactions SET ${sets.join(', ')}
        WHERE organization_id = $1 AND id = $2`,
      values,
    );
  },

  submitRepair: submitRepairIntake,

  async linkRepairToHeader(orgId, repairId, headerId) {
    await tenantQuery(
      orgId,
      `UPDATE repair_service SET counter_transaction_id = $1
        WHERE id = $2 AND organization_id = $3`,
      [headerId, repairId, orgId],
    );
  },

  async stageOrder(orgId, lines, idempotencyKey) {
    if (lines.length === 0) return null;
    // Same two line shapes salesCartStore already sends: a catalog line charges
    // by variation id (the provider's price is authoritative at charge time), a
    // manual line as an ad-hoc name + amount.
    const line_items = lines.map((l) =>
      l.variationId
        ? { catalog_object_id: l.variationId, quantity: String(l.quantity) }
        : {
            name: l.productTitle,
            quantity: String(l.quantity),
            base_price_money: { amount: l.unitAmountCents, currency: 'USD' },
          },
    );
    const res = await squareFetchForOrg<{ order?: { id?: string; total_money?: { amount?: number } } }>(
      orgId,
      '/orders',
      {
        method: 'POST',
        body: { idempotency_key: idempotencyKey, order: { line_items } },
      },
    );
    const orderId = res.data?.order?.id;
    if (!res.ok || !orderId) return null;
    const amount = res.data.order?.total_money?.amount;
    return {
      providerOrderId: orderId,
      totalCents: typeof amount === 'number' ? amount : null,
    };
  },

  confirmPriorOrder: (args) => confirmOrderNumberForPhone(args),

  enqueueTicket: enqueueTicketWork,
};

function toHeaderRow(row: Record<string, unknown>): HeaderRow {
  return {
    id: Number(row.id),
    status: String(row.status) as CounterTransactionStatus,
    customerId: row.customer_id == null ? null : Number(row.customer_id),
    priorOrderRef: (row.prior_order_ref as string | null) ?? null,
    stagedSquareOrderId: (row.staged_square_order_id as string | null) ?? null,
    subtotalCents: Number(row.subtotal_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
  };
}

export async function submitCounterTransaction(
  input: CounterTransactionInput,
  orgId: OrgId,
  deps: SubmitCounterTransactionDeps = defaultDeps,
): Promise<CounterTransactionResult> {
  const warnings: string[] = [];
  const retailLines = (input.retailLines ?? []).filter((l) => l.quantity > 0);
  const service = input.service ?? null;

  // ── Validate ──────────────────────────────────────────────────────────────
  const missing: string[] = [];
  const phone = String(input.customer?.phone ?? '').trim();
  const phoneDigits = lastDigits(phone);
  if (!phone) missing.push('Phone');
  else if (phoneDigits.length < 7) missing.push('A complete phone number');
  if (!String(input.clientEventId ?? '').trim()) missing.push('clientEventId');
  if (retailLines.length === 0 && !service) missing.push('At least one item or a service');
  if (missing.length > 0) throw new CounterTransactionValidationError(missing);

  const clientEventId = input.clientEventId.trim();

  // ── Idempotent replay ─────────────────────────────────────────────────────
  // Checked BEFORE any write. A replayed submit must not double-charge,
  // double-ticket, or double-repair, and the guard has to cover the WHOLE
  // transaction rather than just the provider calls inside it.
  const existing = await deps.findHeaderByClientEvent(orgId, clientEventId);
  if (existing) {
    return {
      counterTransactionId: existing.id,
      status: existing.status,
      customerId: existing.customerId ?? 0,
      priorOrderRef: existing.priorOrderRef,
      // Deliberately not re-derived: the replay reports the ORIGINAL
      // transaction, and re-running the sub-writes to describe them is exactly
      // the double-effect this branch exists to prevent.
      repair: null,
      sale: existing.stagedSquareOrderId
        ? { providerOrderId: existing.stagedSquareOrderId, totalCents: existing.totalCents }
        : null,
      ticketWork: { queued: false, outboxId: null, supportTicketId: null },
      idempotentReplay: true,
      subtotalCents: existing.subtotalCents,
      totalCents: existing.totalCents,
      warnings: ['Replayed submission — the original transaction is unchanged.'],
    };
  }

  // ── Identity (deterministic only) ─────────────────────────────────────────
  const displayName = String(input.customer?.name ?? '').trim();
  const email = String(input.customer?.email ?? '').trim() || undefined;
  let customer = await deps.findCustomerByPhoneDigits(orgId, phoneDigits);
  if (!customer) {
    if (!displayName) {
      throw new CounterTransactionValidationError(['Name (no customer matched that phone)']);
    }
    customer = await deps.createCustomer(orgId, { name: displayName, phone, email });
  }
  // A typed name wins (the customer is standing there correcting it); otherwise
  // fall back to the name already on file.
  const effectiveName = displayName || customer.storedName;

  // ── Prior order: two keys or nothing ─────────────────────────────────────
  let priorOrderRef: string | null = null;
  if (input.priorOrder?.orderNumber) {
    // The phone must be the IDENTITY phone, not a second free-typed value —
    // otherwise "order # + phone" degrades to "order # + any phone you like".
    priorOrderRef = await deps.confirmPriorOrder({
      orgId,
      orderNumber: input.priorOrder.orderNumber,
      phone,
    });
    if (!priorOrderRef) {
      warnings.push('That order number and phone did not match an order — not attached.');
    }
  }

  const { subtotalCents, totalCents } = computeCounterTotals({ retailLines, service });

  // ── The header ────────────────────────────────────────────────────────────
  const header = await deps.insertHeader(orgId, {
    customerId: customer.id,
    kioskDeviceId: input.kioskDeviceId ?? null,
    priorOrderRef,
    subtotalCents,
    totalCents,
    clientEventId,
  });

  // ── The repair (composed) ────────────────────────────────────────────────
  let repair: CounterTransactionResult['repair'] = null;
  let repairFailed = false;
  if (service) {
    try {
      const result = await deps.submitRepair(
        {
          customer: { name: effectiveName, phone: customer.storedPhone, email: email ?? null },
          product: {
            type: service.productType ?? null,
            model: service.productModel,
            sourceSku: service.sourceSku ?? null,
          },
          repairReasons: service.repairReasons ?? [],
          repairNotes: service.repairNotes ?? '',
          serialNumber: service.serialNumber,
          price: service.price,
          notes: service.notes ?? '',
          assignedTechId: service.assignedTechId ?? null,
          signatureDataUrl: service.signatureDataUrl ?? null,
          signatureStrokes: service.signatureStrokes,
          idempotencyKey: clientEventId,
        },
        orgId,
      );
      repair = {
        id: result.id,
        rsNumber: result.rsNumber,
        ticketNumber: result.zendeskTicketNumber,
        documentId: result.documentId,
        signatureUrl: result.signatureUrl,
      };
      if (result.signatureWarning) warnings.push(result.signatureWarning);
      await deps.linkRepairToHeader(orgId, result.id, header.id);
    } catch (err) {
      if (err instanceof RepairIntakeValidationError) {
        // The service half is unusable. Fail loudly rather than silently selling
        // the retail lines and dropping the repair the customer came in for.
        throw new CounterTransactionValidationError(err.missing);
      }
      // A non-validation failure AFTER the header exists is reconcilable, not
      // fatal: the customer may already be paying for the retail half.
      repairFailed = true;
      warnings.push('The repair record could not be created — this visit needs reconciling.');
      console.error('[counter] repair intake failed after header insert', err);
    }
  }

  // ── The staged sale (never charged) ──────────────────────────────────────
  let sale: CounterTransactionResult['sale'] = null;
  if (retailLines.length > 0) {
    try {
      const staged = await deps.stageOrder(orgId, retailLines, clientEventId);
      if (staged) {
        sale = { providerOrderId: staged.providerOrderId, totalCents: staged.totalCents };
        await deps.patchHeader(orgId, header.id, {
          stagedSquareOrderId: staged.providerOrderId,
        });
      } else {
        warnings.push('No payment provider is connected — the cart was not staged.');
      }
    } catch (err) {
      warnings.push('The cart could not be staged for payment — retry from the register.');
      console.error('[counter] order staging failed', err);
    }
  }

  // ── Ticket work (queued, never inline-blocking) ──────────────────────────
  let ticketWork: CounterTransactionResult['ticketWork'] = {
    queued: false,
    outboxId: null,
    supportTicketId: null,
  };
  // Narrow the discriminated union itself rather than an extracted `mode`
  // string — only the union carries `ticketId` on the 'attach' arm.
  const ticketRequest = input.ticketWork ?? { mode: 'none' as const };
  if (ticketRequest.mode !== 'none' && repair) {
    const queued = await deps.enqueueTicket({
      orgId,
      workType: ticketRequest.mode === 'attach' ? 'ATTACH_TICKET' : 'CREATE_TICKET',
      entityType: 'REPAIR',
      entityId: repair.id,
      counterTransactionId: header.id,
      providerTicketId: ticketRequest.mode === 'attach' ? ticketRequest.ticketId : null,
      payload: {
        subject: `${repair.rsNumber} — ${service?.productModel ?? 'counter service'}`,
        body: [
          `Counter drop-off ${repair.rsNumber}.`,
          service?.serialNumber ? `Serial: ${service.serialNumber}` : null,
          priorOrderRef ? `Prior order: ${priorOrderRef}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        requesterName: effectiveName || null,
        requesterEmail: email ?? null,
        idempotencyKey: clientEventId,
      },
    });
    ticketWork = { queued: queued.queued, outboxId: queued.outboxId, supportTicketId: null };
    if (!queued.queued) {
      warnings.push('The helpdesk ticket could not be queued.');
    }
  } else if (ticketRequest.mode !== 'none' && !repair) {
    warnings.push('No service line — no helpdesk ticket was created.');
  }

  // ── Status ───────────────────────────────────────────────────────────────
  // `partially_paid` is the reconcilable state: something was staged for payment
  // but the visit did not fully materialize. Nothing here is ever `paid` — this
  // path does not charge, so only the payment webhook may promote a header.
  const status: CounterTransactionStatus =
    repairFailed && sale ? 'partially_paid' : 'staged';
  if (status !== header.status) {
    await deps.patchHeader(orgId, header.id, { status });
  }

  return {
    counterTransactionId: header.id,
    status,
    customerId: customer.id,
    priorOrderRef,
    repair,
    sale,
    ticketWork,
    idempotentReplay: false,
    subtotalCents,
    totalCents,
    warnings,
  };
}
