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
 *     → submitRepairIntake(..., ticketWork: 'skip')  COMPOSED — counter owns ticket enqueue
 *     → linkRepairToHeader(linked)  an EXISTING ticket brought in — no intake, no ticket
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
 * ## One staged order per visit, not one per money type
 *
 * The staged order carries retail lines AND every repair whose intake already
 * succeeded (built from `repair_service.price` via `serviceLineCents`, the
 * SAME function the header total is built from). A visit that mixed a repair
 * and a retail item used to have no way to settle both on one card — the
 * repair's money lived only in a TEXT column, invisible to Square — so the
 * header could go `partially_paid` after the webhook even though nothing at
 * the counter said why. A repair that fails intake never reaches the staged
 * order (see `stageableRepairLines` below): there is no `repair_service` row
 * to charge for, so including it would be a card presentation for a repair
 * the system has no record of.
 *

 * ## Partial failure is designed for, not hoped against
 *
 * | Case                          | Behavior                                        |
 * |-------------------------------|-------------------------------------------------|
 * | Repair declined, retail sold  | header carries no repair link                    |
 * | Device 2 fails, device 1 kept | device 1 stays logged; warning names which failed |
 * | Sale staged, repair fails     | header stays `partially_paid`, reconcilable      |
 * | Helpdesk down                 | outbox absorbs it; the counter is never blocked |
 * | Any sub-write fails           | the signed agreement survives (ON DELETE SET NULL) |
 */

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

/**
 * An existing `repair_service` row as a visit links it. The money and the
 * device facts come from HERE, never from the tablet: the ticket was quoted
 * when it was written, and a client-supplied figure would let a cart re-price
 * a repair it never took in.
 */
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
      /**
       * Retail/buyback lines persisted WITH the header (same transaction).
       * Repairs are excluded on purpose — repair_service rows are their
       * record and the receipt prints them as devices; a copy here would
       * double-print. Deterministic line_uuid (`clientEventId:idx`) keeps a
       * replayed submit idempotent against the UNIQUE constraint.
       */
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
  /**
   * Point a repair at the header. Guarded: it only claims a row that is
   * unlinked (or already this header's), and reports whether it did — a
   * linked repair that another visit claimed a moment earlier must not be
   * charged on this one too.
   */
  linkRepairToHeader(orgId: OrgId, repairId: number, headerId: number): Promise<boolean>;
  /** The existing repairs a visit links, org-scoped. Missing ids are simply absent. */
  findLinkableRepairs(orgId: OrgId, repairIds: number[]): Promise<LinkableRepairRow[]>;

  /**
   * Creates a provider order and stops.
   *
   * `lines` is the WHOLE staged charge for this visit — retail plus every
   * repair whose intake already succeeded — never retail alone. A cart that
   * mixed a repair and a cable used to have no way to settle both on one card
   * (the repair's money lived only in `repair_service.price`, a TEXT column);
   * see the module docblock and `submitCounterTransaction`'s staging step.
   *
   * Returns a discriminated result rather than `null` on any failure: a
   * missing/unconnected provider and a provider REJECTING the request are
   * different operator-facing problems, and collapsing them to one `null` is
   * exactly how "Square said your line items are malformed" became the
   * misleading "No payment provider is connected."
   */
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

/**
 * The subset {@link interpretStageOrderResponse} can actually produce — it
 * only ever sees a Square response, so it can never report `'not_configured'`
 * (that reason comes from config RESOLUTION failing, one layer up in
 * `defaultDeps.stageOrder`, before any request is sent). Narrower than
 * {@link StageOrderResult} so a caller of the pure function does not have to
 * defensively handle a branch it cannot reach.
 */
export type StageOrderNetworkResult =
  | { staged: true; providerOrderId: string; totalCents: number | null }
  | { staged: false; reason: 'rejected'; error: string };

/**
 * A repair's Square line-item name — the device plus what is being fixed,
 * never a bare id. A customer reading the emailed Square receipt has no other
 * way to tell "RS-1042" apart from the cable they also bought at the counter.
 * Falls back to the RS# only when no reason was recorded.
 */
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

/**
 * The CreateOrder request body. Pure — no fetch, no config resolution — so the
 * two defects this exists to pin (missing `location_id`, hardcoded `'USD'`)
 * can be asserted without a network call. Mirrors `buildTerminalCheckoutBody`
 * in `terminal-checkout.ts`.
 *
 * Every line stages ad-hoc: `name` + `base_price_money` (the line's own unit
 * price) in the ORG's currency, never a hardcoded one.
 *
 * Until 2026-09-23 a retail line with a `variationId` was sent as
 * `{ catalog_object_id }` alone, so Square would have charged its own catalog
 * price. But that id is the **Ecwid** listing id (`catalog-search.ts`
 * `PROJECTION_PLATFORM = 'ecwid'`), and this org stores no Square catalog ids
 * anywhere. Square could not resolve it, and a price edited at the counter
 * would have been ignored at the reader. The id stays on
 * `counter_transaction_lines.variation_id` for reporting and never reaches Square.
 *
 * An item note rides as `OrderLineItem.note` (Square caps it at 2000), and a
 * comp names itself there too, so the $0 line on the Square receipt says why.
 */
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

/**
 * Turn a Square CreateOrder response into a {@link StageOrderResult}. Pure —
 * the caller is responsible for logging; this only decides WHAT happened.
 *
 * A missing `order.id` on a 200 is treated the same as `!ok`: Square has never
 * been observed doing this, but trusting an order that has no id to charge
 * against is worse than a defensive rejection.
 */
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

/**
 * The ONE phone → customer match: trailing 10 digits, org-scoped, newest row
 * wins. Exported so the kiosk's live lookup (`GET /api/kiosk/customer`) shows
 * the staffer exactly the customer submit will attach — two queries would be
 * two answers to "who is this phone".
 */
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
    // Config resolution (Nango token, or env fallback) THROWS when nothing is
    // connected — that is the actual "no provider" signal, and it is distinct
    // from Square answering and rejecting the request. Conflating the two is
    // the defect this branch exists to fix: an operator was being told "No
    // payment provider is connected" for a request Square flatly rejected.
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
  /*
   * PRE-FLIGHT EVERY DEVICE, before a single row is written.
   *
   * Validating inside the write loop made the outcome depend on cart ORDER,
   * and one of the two orders lost a device permanently:
   *
   *   [invalid, valid] → threw AFTER insertHeader, so an orphan header owned
   *                      this visit's client_event_id forever. The retry hit
   *                      the replay short-circuit and returned "unchanged"
   *                      with no repairs — the valid device was never recorded.
   *   [valid, invalid] → the first device was already written, so the throw
   *                      was downgraded to a warning and the visit returned 200.
   *
   * Same two devices, opposite failure modes, decided by scan order. Hoisting
   * the check above `insertHeader` makes an invalid visit fail cleanly with
   * nothing written and the idempotency key still free to retry.
   *
   * The rule itself is IMPORTED from submit-repair-intake — copying its six
   * conditions here would be the fork this repo's compose-don't-fork law
   * exists to prevent, and the drift would be invisible until a device went
   * missing.
   */
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

  // ── Linked repairs: proven before any write ──────────────────────────────
  //
  // Read back from the book, org-scoped. A repair already on ANOTHER visit is
  // refused outright rather than re-pointed: moving it would silently strip it
  // from the receipt and staged order the first visit already printed.
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
  //
  // One `repair_service` row per device. The DB always allowed this —
  // `repair_service.counter_transaction_id` is many→one — so the 1:1 lived only
  // in this loop's absence.
  const repairs: CounterTransactionResult['repairs'] = [];
  let repairFailed = false;
  /**
   * The billable half of the repairs, built up ONLY on success. A device whose
   * intake threw never got a `repair_service` row, so charging for it would be
   * a card presentation for a repair the system has no record of — the same
   * hazard a soft-voided cart line guards against, just reached from the other
   * direction. This is why staging happens AFTER this loop rather than beside
   * `retailLines` at the top of the function.
   */
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
          // PER DEVICE, not per visit. The key dedupes the helpdesk ticket, so
          // sharing `clientEventId` across a two-device visit would collapse
          // both devices onto one ticket. Suffixed by cart position, which is
          // stable across a retry of the same submit.
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
        /*
         * A backstop, not the gate. Everything this can catch was already
         * checked above `insertHeader` by the pre-flight, so reaching here
         * means the shared rule and this path disagree — which is a bug in the
         * pre-flight, not in the operator's input.
         *
         * It does NOT throw: the header exists by now, and throwing would let
         * an orphan header keep the visit's idempotency key while the customer's
         * other device sits recorded. Degrade to the same reconcilable warning
         * as any other post-header failure and name the device.
         */
        console.error('[counter] pre-flight missed a repair validation error', err.missing);
      }
      // A failure AFTER a device is already logged is reconcilable, not fatal:
      // throwing here would report the whole visit as failed while device #1
      // sits in the system with the customer's property attached to it. Same
      // reasoning the original single-repair path used for non-validation
      // errors, now extended to the only case N can produce.
      repairFailed = true;
      warnings.push(
        `Device ${index + 1} of ${services.length} (${service.productModel || 'unnamed'}) ` +
          'could not be recorded — this visit needs reconciling.',
      );
      console.error('[counter] repair intake failed after header insert', err);
    }
  }

  // ── The linked repairs ───────────────────────────────────────────────────
  //
  // Pointed at this header and staged beside the new devices, but never passed
  // to `submitRepair` and never ticketed: the intake, signature and helpdesk
  // conversation already exist on the ticket. `repairs` (and so ticket work
  // below) stays new-devices-only for the same reason.
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
  //
  // RETAIL + every repair that actually landed, as ONE Square order. A visit
  // with a repair and a cable used to have no way to settle both on one card:
  // the repair's money lived only in `repair_service.price` (TEXT), so a
  // retail-only guard here left the repair uncharged with the header total
  // covering it regardless — a header that quietly went `partially_paid` after
  // the webhook, with nothing at the counter to say why.
  //
  // A repair-only visit now stages too, deliberately: the point of widening
  // this list is that a repair becomes payable at all, and gating staging on
  // `retailLines.length` (the pre-existing guard) would leave that case
  // exactly as broken as before.
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
    repairs,
    sale,
    ticketWork,
    idempotentReplay: false,
    subtotalCents,
    totalCents,
    warnings,
  };
}
