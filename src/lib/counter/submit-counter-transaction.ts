/** submitCounterTransaction — the ONE counter-visit write path, as a principal-agnostic domain helper. */

import { confirmOrderNumberForPhone } from '@/lib/ecwid/client';
import { createRepairCustomer } from '@/lib/neon/customer-queries';
import {
  missingRepairIntakeFields,
  RepairIntakeValidationError,
  submitRepairIntake,
} from '@/lib/repair/submit-repair-intake';
import { formatSquareErrors, type SquareConfig, type SquareError } from '@/lib/square/client';
import { resolveSquareConfig, squareFetchForOrg } from '@/lib/square/server';
import { enqueueTicketWork } from '@/lib/support/ticket-outbox';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  computeCounterTotals,
  serviceLineCents,
  type CounterRetailLine,
  type CounterServiceLine,
  type CounterTransactionInput,
  type CounterTransactionResult,
  type CounterTransactionStatus,
} from './counter-transaction-types';

/** Thrown when the input cannot describe a transaction at all. Callers map → 400. */
export class CounterTransactionValidationError extends Error {
  readonly missing: string[];
  /**
   * `message` overrides the "Missing required fields" sentence for refusals
   * that are not a missing field — a linked repair already on another visit is
   * a fact to act on, and the tablet prints this message verbatim.
   */
  constructor(missing: string[], message?: string) {
    super(message ?? `Missing required fields: ${missing.join(', ')}`);
    this.name = 'CounterTransactionValidationError';
    this.missing = missing;
  }
}

/** An existing `repair_service` row as a visit links it. */
export interface LinkableRepairRow {
  id: number;
  ticketNumber: string | null;
  productTitle: string;
  serialNumber: string;
  /** `repair_service.price` — TEXT, parsed by `serviceLineCents` like any quote. */
  price: string;
  issue: string | null;
  counterTransactionId: number | null;
}

interface ResolvedCustomer {
  id: number;
  /** The phone string AS STORED on the customer row. */
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
  /** Match an existing customer on the TRAILING DIGITS of the phone, org-scoped. */
  findCustomerByPhoneDigits(orgId: OrgId, phoneDigits: string): Promise<ResolvedCustomer | null>;
  createCustomer(
    orgId: OrgId,
    args: { name: string; phone: string; email?: string; address?: string },
  ): Promise<ResolvedCustomer>;
  /** Callers: submitCounterTransaction after phone match. Schema: customers.shipping_address_1. User: "intake their information like name, email address, phone number, address" */
  patchCustomerAddress?(orgId: OrgId, customerId: number, address: string): Promise<void>;

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
      /** Retail/buyback lines persisted WITH the header (same transaction). */
      retailLines: CounterRetailLine[];
    },
  ): Promise<HeaderRow>;
  patchHeader(
    orgId: OrgId,
    headerId: number,
    patch: { status?: CounterTransactionStatus; stagedSquareOrderId?: string | null },
  ): Promise<void>;

  /** COMPOSED, never re-implemented. */
  submitRepair: typeof submitRepairIntake;
  /** Point a repair at the header. */
  linkRepairToHeader(orgId: OrgId, repairId: number, headerId: number): Promise<boolean>;
  /** The existing repairs a visit links, org-scoped. Missing ids are simply absent. */
  findLinkableRepairs(orgId: OrgId, repairIds: number[]): Promise<LinkableRepairRow[]>;

  /** Creates a provider order and stops. */
  stageOrder(
    orgId: OrgId,
    lines: CounterRetailLine[],
    idempotencyKey: string,
  ): Promise<StageOrderResult>;

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

/**
 * `stageOrder`'s outcome. `'not_configured'` and `'rejected'` are kept
 * distinct on purpose — see the Deps docblock above.
 */
export type StageOrderResult = StageOrderNetworkResult | { staged: false; reason: 'not_configured' };

/** The subset {@link interpretStageOrderResponse} can actually produce — it only ever sees a Square response, so it can never report… */
export type StageOrderNetworkResult =
  | { staged: true; providerOrderId: string; totalCents: number | null }
  | { staged: false; reason: 'rejected'; error: string };

/** A repair's Square line-item name — the device plus what is being fixed, never a bare id. */
function repairLineItemName(service: CounterServiceLine, rsNumber: string): string {
  const reasons = (service.repairReasons ?? [])
    .map((r) => String(r ?? '').trim())
    .filter(Boolean);
  const summary = reasons.length > 0 ? reasons.join(', ') : rsNumber;
  return `${service.productModel} repair — ${summary}`;
}

/** The RS number a linked ticket answers to; the id when it was never ticketed. */
function linkedRepairLabel(row: LinkableRepairRow): string {
  return row.ticketNumber || `RS-${row.id}`;
}

/**
 * A linked ticket as a service line — ONLY so it can flow through the same
 * `serviceLineCents` / `repairLineItemName` a new device does. It is never
 * handed to `submitRepair` or the pre-flight: those mean "take a device in".
 */
function linkedServiceLine(row: LinkableRepairRow): CounterServiceLine {
  return {
    productModel: row.productTitle.trim() || linkedRepairLabel(row),
    serialNumber: row.serialNumber,
    price: row.price,
    repairReasons: row.issue ? [row.issue] : [],
  };
}

/**
 * Read and prove the repairs a visit links, in the order the cart listed them.
 * Refuses (nothing written yet) when one is not in this org's book or already
 * sits on another visit.
 */
async function linkedRepairRows(
  orgId: OrgId,
  repairIds: number[],
  deps: SubmitCounterTransactionDeps,
): Promise<LinkableRepairRow[]> {
  if (repairIds.length === 0) return [];
  const found = await deps.findLinkableRepairs(orgId, repairIds);
  const rows: LinkableRepairRow[] = [];
  for (const repairId of repairIds) {
    const row = found.find((candidate) => candidate.id === repairId);
    if (!row) {
      throw new CounterTransactionValidationError(
        [`Linked repair ${repairId}`],
        'A linked repair is no longer in the book — remove it from the cart.',
      );
    }
    if (row.counterTransactionId !== null) {
      const label = linkedRepairLabel(row);
      throw new CounterTransactionValidationError(
        [`Linked repair ${label}`],
        `${label} is already on visit #${row.counterTransactionId} — remove it from the cart.`,
      );
    }
    rows.push(row);
  }
  return rows;
}

/** The CreateOrder request body. */
export function buildStageOrderBody(
  lines: CounterRetailLine[],
  cfg: Pick<SquareConfig, 'locationId' | 'currency'>,
  idempotencyKey: string,
): Record<string, unknown> {
  const line_items = lines.map((l) => {
    const note = [
      l.priceAdjustment?.kind === 'comp' ? `Comp · ${l.priceAdjustment.reason}` : null,
      l.note?.trim() || null,
    ]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 2000);
    return {
      name: l.productTitle,
      quantity: String(l.quantity),
      base_price_money: { amount: l.unitAmountCents, currency: cfg.currency },
      ...(note ? { note } : {}),
    };
  });
  return {
    idempotency_key: idempotencyKey,
    order: { location_id: cfg.locationId, line_items },
  };
}

/** Turn a Square CreateOrder response into a {@link StageOrderResult}. */
export function interpretStageOrderResponse(res: {
  ok: boolean;
  data: { order?: { id?: string; total_money?: { amount?: number } } };
  errors?: SquareError[];
}): StageOrderNetworkResult {
  const orderId = res.data?.order?.id;
  if (!res.ok || !orderId) {
    return {
      staged: false,
      reason: 'rejected',
      error: formatSquareErrors(res.errors) || 'Square declined the request.',
    };
  }
  const amount = res.data.order?.total_money?.amount;
  return {
    staged: true,
    providerOrderId: orderId,
    totalCents: typeof amount === 'number' ? amount : null,
  };
}

/** The ONE phone → customer match: */
export async function findCounterCustomerByPhoneDigits(
  orgId: OrgId,
  phoneDigits: string,
): Promise<ResolvedCustomer | null> {
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
}

const defaultDeps: SubmitCounterTransactionDeps = {
  findCustomerByPhoneDigits: findCounterCustomerByPhoneDigits,

  async createCustomer(orgId, args) {
    const created = await createRepairCustomer(args, orgId);
    return {
      id: created.id,
      storedPhone: created.phone ?? args.phone,
      storedName:
        created.display_name?.trim() || created.customer_name?.trim() || args.name,
    };
  },
  async patchCustomerAddress(orgId, customerId, address) {
    await tenantQuery(
      orgId,
      `UPDATE customers
          SET shipping_address_1 = $1, updated_at = NOW()
        WHERE organization_id = $2 AND id = $3`,
      [address, orgId, customerId],
    );
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
      // The receipt's itemized truth for session-less visits rides the SAME
      // transaction: a header without lines is a receipt that prints money
      // and "No items on this visit."
      if (args.retailLines.length > 0) {
        const headerId = Number(res.rows[0]!.id);
        for (let i = 0; i < args.retailLines.length; i += 1) {
          const line = args.retailLines[i]!;
          const adjustment = line.priceAdjustment ?? null;
          await client.query(
            `INSERT INTO counter_transaction_lines
               (organization_id, counter_transaction_id, line_uuid, line_type,
                title, sku, variation_id, quantity, unit_amount_cents, sort_index,
                original_unit_amount_cents, price_adjust_kind, price_adjust_reason,
                price_adjusted_by_staff_id, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT (counter_transaction_id, line_uuid) DO NOTHING`,
            [
              orgId,
              headerId,
              `${args.clientEventId}:${i}`,
              line.unitAmountCents < 0 ? 'BUYBACK' : 'RETAIL',
              line.productTitle,
              line.sku || null,
              line.variationId,
              line.quantity,
              line.unitAmountCents,
              i,
              adjustment?.originalUnitAmountCents ?? null,
              adjustment?.kind ?? null,
              adjustment?.reason ?? null,
              adjustment?.staffId ?? null,
              line.note?.trim() || null,
            ],
          );
        }
      }
      return toHeaderRow(res.rows[0]!);
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
    const res = await tenantQuery(
      orgId,
      `UPDATE repair_service SET counter_transaction_id = $1
        WHERE id = $2 AND organization_id = $3
          AND (counter_transaction_id IS NULL OR counter_transaction_id = $1)`,
      [headerId, repairId, orgId],
    );
    return (res.rowCount ?? 0) > 0;
  },

  async findLinkableRepairs(orgId, repairIds) {
    if (repairIds.length === 0) return [];
    const res = await tenantQuery<Record<string, unknown>>(
      orgId,
      `SELECT id,
              NULLIF(TRIM(COALESCE(ticket_number, '')), '') AS ticket_number,
              COALESCE(product_title, '')                   AS product_title,
              COALESCE(serial_number, '')                   AS serial_number,
              COALESCE(price, '')                           AS price,
              NULLIF(TRIM(COALESCE(issue, '')), '')         AS issue,
              counter_transaction_id
         FROM repair_service
        WHERE organization_id = $1 AND id = ANY($2::int[])`,
      [orgId, repairIds],
    );
    return res.rows.map((row) => ({
      id: Number(row.id),
      ticketNumber: (row.ticket_number as string | null) ?? null,
      productTitle: String(row.product_title ?? ''),
      serialNumber: String(row.serial_number ?? ''),
      price: String(row.price ?? ''),
      issue: (row.issue as string | null) ?? null,
      counterTransactionId:
        row.counter_transaction_id == null ? null : Number(row.counter_transaction_id),
    }));
  },

  async stageOrder(orgId, lines, idempotencyKey) {
    // Config resolution (Nango token, or env fallback) THROWS when nothing is connected — that is the actual "no provider" signal, and it is…
    let cfg: SquareConfig;
    try {
      cfg = await resolveSquareConfig(orgId);
    } catch (err) {
      console.error('[counter] Square is not configured for this org — cart not staged', err);
      return { staged: false, reason: 'not_configured' };
    }

    const res = await squareFetchForOrg<{ order?: { id?: string; total_money?: { amount?: number } } }>(
      orgId,
      '/orders',
      { method: 'POST', body: buildStageOrderBody(lines, cfg, idempotencyKey) },
    );

    const outcome = interpretStageOrderResponse(res);
    if (!outcome.staged) {
      // Log the provider's actual errors — swallowing them here is what made
      // a malformed request look identical to no provider at all.
      console.error('[counter] Square rejected the staged order', outcome.error, res.errors);
    }
    return outcome;
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
  // One entry per device dropped off. Was a single `service` until 2026-08-21;
  // see CounterTransactionInput.services for why the singular field was removed
  // outright rather than aliased.
  const services = (input.services ?? []).filter(Boolean);
  // Existing repairs this visit links. Deduped: one ticket linked twice would
  // be charged twice on the staged order.
  const linkedRepairIds = [
    ...new Set(
      (input.linkedRepairs ?? [])
        .map((link) => link?.repairId)
        .filter((id): id is number => Number.isSafeInteger(id) && id > 0),
    ),
  ];

  // ── Validate ──────────────────────────────────────────────────────────────
  const missing: string[] = [];
  const phone = String(input.customer?.phone ?? '').trim();
  const phoneDigits = lastDigits(phone);
  if (!phone) missing.push('Phone');
  else if (phoneDigits.length < 7) missing.push('A complete phone number');
  if (!String(input.clientEventId ?? '').trim()) missing.push('clientEventId');
  if (retailLines.length === 0 && services.length === 0 && linkedRepairIds.length === 0) {
    missing.push('At least one item or a service');
  }
  /* PRE-FLIGHT EVERY DEVICE, before a single row is written. */
  services.forEach((service, index) => {
    const label = services.length > 1 ? `Device ${index + 1}` : 'Service';
    for (const field of missingRepairIntakeFields({
      // Identity is shared across the visit, so a missing name/phone is
      // reported once by the customer check above rather than N times here.
      name: 'pre-flight',
      phone: 'pre-flight',
      productTitle: String(service.productModel ?? '').trim(),
      reasons: (service.repairReasons ?? []).map((r) => String(r ?? '').trim()).filter(Boolean),
      repairNotes: String(service.repairNotes ?? '').trim(),
      serialNumber: String(service.serialNumber ?? '').trim(),
      price: String(service.price ?? '').trim(),
    })) {
      missing.push(`${label}: ${field}`);
    }
  });

  if (missing.length > 0) throw new CounterTransactionValidationError(missing);

  const clientEventId = input.clientEventId.trim();

  // ── Idempotent replay ───────────────────────────────────────────────────── Checked BEFORE any write.
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
      repairs: [],
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

  // ── Linked repairs:
  const linkedRows = await linkedRepairRows(orgId, linkedRepairIds, deps);
  const linkedServices = linkedRows.map(linkedServiceLine);

  // ── Identity (deterministic only) ─────────────────────────────────────────
  const displayName = String(input.customer?.name ?? '').trim();
  const email = String(input.customer?.email ?? '').trim() || undefined;
  let customer = await deps.findCustomerByPhoneDigits(orgId, phoneDigits);
  if (!customer) {
    if (!displayName) {
      throw new CounterTransactionValidationError(['Name (no customer matched that phone)']);
    }
    customer = await deps.createCustomer(orgId, {
      name: displayName,
      phone,
      email,
      address: String(input.customer?.address ?? '').trim() || undefined,
    });
  }
  const address = String(input.customer?.address ?? '').trim();
  if (address && deps.patchCustomerAddress) {
    await deps.patchCustomerAddress(orgId, customer.id, address);
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

  // Linked repairs count toward the visit exactly as a new device does —
  // through `serviceLineCents` on the ticket's own quote — so the header total
  // and the staged order below cannot disagree about what they cost.
  const { subtotalCents, totalCents } = computeCounterTotals({
    retailLines,
    services: [...services, ...linkedServices],
  });

  // ── The header ────────────────────────────────────────────────────────────
  const header = await deps.insertHeader(orgId, {
    customerId: customer.id,
    kioskDeviceId: input.kioskDeviceId ?? null,
    priorOrderRef,
    subtotalCents,
    totalCents,
    clientEventId,
    retailLines,
  });

  // ── The repairs (composed) ───────────────────────────────────────────────
  const repairs: CounterTransactionResult['repairs'] = [];
  let repairFailed = false;
  /** The billable half of the repairs, built up ONLY on success. */
  const stageableRepairLines: CounterRetailLine[] = [];

  for (const [index, service] of services.entries()) {
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
          // PER DEVICE, not per visit.
          idempotencyKey: `${clientEventId}:${index}`,
          // Counter owns CREATE_TICKET / ATTACH via ticket_work_outbox below —
          // skip the inline create so we never mint two tickets for one device.
          ticketWork: 'skip',
        },
        orgId,
      );
      repairs.push({
        id: result.id,
        rsNumber: result.rsNumber,
        ticketNumber: result.zendeskTicketNumber,
        documentId: result.documentId,
        signatureUrl: result.signatureUrl,
        // The device's own facts, straight off the line that was written — the
        // success screen reads these back to the customer per unit, and the
        // money is `serviceLineCents`, the same integer the header total used.
        productTitle: service.productModel,
        serialNumber: service.serialNumber,
        priceCents: serviceLineCents(service),
      });
      // Same function the header total is built from (`serviceLineCents`) —
      // the staged charge and the quote can never disagree about what this
      // device costs, which is the whole point of routing both through it.
      stageableRepairLines.push({
        variationId: null,
        sku: `REPAIR-${result.id}`,
        productTitle: repairLineItemName(service, result.rsNumber),
        quantity: 1,
        unitAmountCents: serviceLineCents(service),
      });
      if (result.signatureWarning) warnings.push(result.signatureWarning);
      await deps.linkRepairToHeader(orgId, result.id, header.id);
    } catch (err) {
      if (err instanceof RepairIntakeValidationError) {
        /* A backstop, not the gate. */
        console.error('[counter] pre-flight missed a repair validation error', err.missing);
      }
      // A failure AFTER a device is already logged is reconcilable, not fatal:
      repairFailed = true;
      warnings.push(
        `Device ${index + 1} of ${services.length} (${service.productModel || 'unnamed'}) ` +
          'could not be recorded — this visit needs reconciling.',
      );
      console.error('[counter] repair intake failed after header insert', err);
    }
  }

  // ── The linked repairs ───────────────────────────────────────────────────
  for (const [index, row] of linkedRows.entries()) {
    const linkedService = linkedServices[index]!;
    const rsNumber = linkedRepairLabel(row);
    try {
      const claimed = await deps.linkRepairToHeader(orgId, row.id, header.id);
      if (!claimed) {
        // Another visit claimed it between the check above and this write.
        // Charging it here too would bill one repair on two receipts.
        repairFailed = true;
        warnings.push(`${rsNumber} was linked to another visit a moment ago — it is not charged here.`);
        continue;
      }
      stageableRepairLines.push({
        variationId: null,
        sku: `REPAIR-${row.id}`,
        productTitle: repairLineItemName(linkedService, rsNumber),
        quantity: 1,
        unitAmountCents: serviceLineCents(linkedService),
      });
    } catch (err) {
      repairFailed = true;
      warnings.push(`${rsNumber} could not be linked to this visit — it needs reconciling.`);
      console.error('[counter] linking an existing repair failed after header insert', err);
    }
  }

  // ── The staged sale (never charged) ──────────────────────────────────────
  const stageLines: CounterRetailLine[] = [...retailLines, ...stageableRepairLines];
  let sale: CounterTransactionResult['sale'] = null;
  if (stageLines.length > 0) {
    try {
      const staged = await deps.stageOrder(orgId, stageLines, clientEventId);
      if (staged.staged) {
        sale = { providerOrderId: staged.providerOrderId, totalCents: staged.totalCents };
        await deps.patchHeader(orgId, header.id, {
          stagedSquareOrderId: staged.providerOrderId,
        });
      } else if (staged.reason === 'not_configured') {
        warnings.push('No payment provider is connected — the cart was not staged.');
      } else {
        // Distinct from the "not connected" warning above on purpose — a
        // provider IS connected here, it rejected this specific request, and
        // the operator needs Square's own words to act on it.
        warnings.push(`Square declined the staged order: ${staged.error}`);
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
  if (ticketRequest.mode !== 'none' && repairs.length > 0) {
    // ONE PER DEVICE. Each repair carries its own RS# and its own lifecycle, so
    // each gets its own ticket — the outbox's unique index is keyed on
    // `entity_id`, so N rows are naturally distinct rather than colliding.
    let allQueued = true;
    let firstOutboxId: number | null = null;

    for (const [index, repair] of repairs.entries()) {
      const service = services[index];
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
            services.length > 1 ? `Device ${index + 1} of ${services.length} this visit.` : null,
            priorOrderRef ? `Prior order: ${priorOrderRef}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          requesterName: effectiveName || null,
          requesterEmail: email ?? null,
          // PER DEVICE. This key is the provider-side dedupe; sharing the
          // visit's `clientEventId` across devices would collapse a two-device
          // drop-off into a single helpdesk ticket.
          idempotencyKey: `${clientEventId}:${repair.id}`,
        },
      });
      if (firstOutboxId === null) firstOutboxId = queued.outboxId;
      if (!queued.queued) {
        allQueued = false;
        warnings.push(`The helpdesk ticket for ${repair.rsNumber} could not be queued.`);
      }
    }

    // Aggregate: `queued` is true only when EVERY device's ticket was queued —
    // a partial success reported as success is how one device's conversation
    // goes missing without anyone noticing. `outboxId` names the first of N.
    ticketWork = { queued: allQueued, outboxId: firstOutboxId, supportTicketId: null };
  } else if (ticketRequest.mode !== 'none' && repairs.length === 0) {
    warnings.push('No service line — no helpdesk ticket was created.');
  }

  // ── Status ─────────────────────────────────────────────────────────────── `partially_paid` is the reconcilable state:
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
    repairs,
    sale,
    ticketWork,
    idempotentReplay: false,
    subtotalCents,
    totalCents,
    warnings,
  };
}
