/**
 * Counter-transaction contract — the shape `submitCounterTransaction` accepts
 * and returns.
 *
 * This module is deliberately **pure**: types, the status vocabulary, and
 * DB-free total math. No DB import, no server-only import, no vendor SDK — so
 * the kiosk form (a client component) and the server orchestrator can both
 * import it without either dragging the other's graph into its bundle
 * (`.claude/rules/build-gotchas.md` → bundle altitude).
 *
 * It lands ahead of the orchestrator on purpose: the form work builds against
 * these types while phase 04 implements them.
 *
 * A counter visit produces **two linked records**, never one mixed-line order:
 * a `counter_transactions` header joining an optional `square_transactions`
 * receipt (money) and an optional `repair_service` work record (a 5-business-day
 * state machine). See `docs/todo/kiosk-counter-transaction-PLAN.md` §1 D1.
 */

/**
 * One retail line staged at the counter.
 *
 * Mirrors the two shapes `SalesCartLine` already carries
 * (`src/components/walk-in/salesCartStore.ts`), because the kiosk composes that
 * store rather than forking a second cart: a catalog line charges by
 * `catalog_object_id` (the provider's price is authoritative at charge time),
 * and a manual line charges as an ad-hoc name + amount.
 */
export interface CounterRetailLine {
  /** Provider catalog variation id. `null` = ad-hoc manual line. */
  variationId: string | null;
  sku: string;
  productTitle: string;
  quantity: number;
  /** Unit price in minor units (cents). */
  unitAmountCents: number;
}

/**
 * The service (repair) half of a counter visit.
 *
 * Field-for-field compatible with what `submitRepairIntake` validates, so the
 * orchestrator can **compose** that helper rather than re-inline it. `price` is
 * a display string because `repair_service.price` is text — do not "fix" it to a
 * number here without migrating the column.
 */
export interface CounterServiceLine {
  productType?: string | null;
  /** Required by submitRepairIntake as `product.model`. */
  productModel: string;
  sourceSku?: string | null;
  repairReasons?: string[];
  repairNotes?: string | null;
  serialNumber: string;
  price: string;
  notes?: string | null;
  assignedTechId?: number | null;
  signatureDataUrl?: string | null;
  signatureStrokes?: unknown;
}

/**
 * Deterministic identity only (plan D7). Phone unlocks create-or-match; there is
 * no searchable customer list, because the device principal is
 * unattended-capable and every readable field is readable by a stranger.
 */
export interface CounterCustomerInput {
  phone: string;
  name?: string | null;
  email?: string | null;
}

/**
 * A prior order reveals **only** on order-number + phone together. Both or
 * nothing — an order number alone is a guessable key on an unattended tablet.
 */
export interface CounterPriorOrderInput {
  /** Public order number as the customer reads it off their receipt. */
  orderNumber: string;
  phone: string;
}

/** What the transaction should do about a helpdesk ticket. */
export type CounterTicketWorkInput =
  | { mode: 'none' }
  | { mode: 'create' }
  | { mode: 'attach'; ticketId: number };

export interface CounterTransactionInput {
  customer: CounterCustomerInput;
  retailLines?: CounterRetailLine[];
  /** Omit or null for a retail-only visit (no signature step, no repair row). */
  service?: CounterServiceLine | null;
  priorOrder?: CounterPriorOrderInput | null;
  ticketWork?: CounterTicketWorkInput;
  /**
   * Idempotency anchor for the WHOLE transaction — not just the ticket call.
   * A counter transaction charges money, so a replay must not double-charge,
   * double-ticket, or double-repair. Guarded by
   * `ux_counter_transactions_client_event`.
   */
  clientEventId: string;
  /** The `via` principal, for audit. Never an authorization input. */
  kioskDeviceId?: number | null;
  /** Stepped-up staff actor, or null when the device acted alone. */
  steppedUpStaffId?: number | null;
}

export const COUNTER_TRANSACTION_STATUSES = [
  'staged',
  'paid',
  'partially_paid',
  'abandoned',
  'voided',
] as const;

/** Mirrors `counter_transactions_status_chk`. Keep the two in lockstep. */
export type CounterTransactionStatus = (typeof COUNTER_TRANSACTION_STATUSES)[number];

export function isCounterTransactionStatus(value: string): value is CounterTransactionStatus {
  return (COUNTER_TRANSACTION_STATUSES as readonly string[]).includes(value);
}

export interface CounterRepairOutcome {
  id: number;
  rsNumber: string;
  /** Null when the helpdesk was unreachable — the outbox will land it later. */
  ticketNumber: string | null;
  documentId: number | null;
  signatureUrl: string | null;
}

/**
 * A **staged** order. There is no `paid` field here by design: the kiosk stages
 * and never charges (plan D4). Payment completes on a physical terminal or
 * behind a staff PIN step-up.
 */
export interface CounterSaleOutcome {
  providerOrderId: string;
  totalCents: number | null;
}

export interface CounterTicketWorkOutcome {
  /** True when the work was enqueued for the outbox rather than done inline. */
  queued: boolean;
  outboxId: number | null;
  supportTicketId: number | null;
}

export interface CounterTransactionResult {
  counterTransactionId: number;
  status: CounterTransactionStatus;
  customerId: number;
  /** Resolved public order number, or null when no prior order matched. */
  priorOrderRef: string | null;
  repair: CounterRepairOutcome | null;
  sale: CounterSaleOutcome | null;
  ticketWork: CounterTicketWorkOutcome;
  /**
   * True when `clientEventId` matched an existing header, so nothing was
   * re-written and the fields above describe the ORIGINAL transaction.
   */
  idempotentReplay: boolean;
  subtotalCents: number;
  totalCents: number;
  /**
   * Non-fatal degradations (signature upload failed, helpdesk queued, prior
   * order did not match). A warning never means the transaction failed.
   */
  warnings: string[];
}

// ── Pure totals ─────────────────────────────────────────────────────────────

/**
 * Sum the staged lines, in cents.
 *
 * `subtotalCents` covers retail lines only; a service line's quoted price is
 * added into `totalCents` so the header's total reflects the whole visit. Tax is
 * deliberately absent — the provider computes it at charge time and the local
 * projection is authoritative for **display** only (plan §6, catalog drift row).
 *
 * A malformed service price contributes 0 rather than NaN: a bad quote must not
 * turn a whole receipt into "$NaN" on a customer-facing screen.
 */
export function computeCounterTotals(input: {
  retailLines?: CounterRetailLine[];
  service?: CounterServiceLine | null;
}): { subtotalCents: number; totalCents: number } {
  const subtotalCents = (input.retailLines ?? []).reduce((sum, line) => {
    const qty = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
    const unit = Number.isFinite(line.unitAmountCents)
      ? Math.max(0, Math.trunc(line.unitAmountCents))
      : 0;
    return sum + qty * unit;
  }, 0);

  return {
    subtotalCents,
    totalCents: subtotalCents + serviceLineCents(input.service),
  };
}

/**
 * Parse a repair quote (`repair_service.price`, a text column holding things
 * like `"130"`, `"$130.00"`, `"130.50"`) into cents. Returns 0 for anything
 * unparseable.
 */
export function serviceLineCents(service?: CounterServiceLine | null): number {
  if (!service) return 0;
  const raw = String(service.price ?? '').trim();
  // Reject a negative quote BEFORE stripping punctuation. Stripping first would
  // delete the minus sign and silently turn "-50" into a positive $50 charge on
  // a customer receipt — the sign has to be read while it still exists.
  if (raw.startsWith('-')) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return 0;
  return Math.round(dollars * 100);
}

/** A visit with a service line requires a signed intake agreement; retail alone does not. */
export function requiresSignature(input: { service?: CounterServiceLine | null }): boolean {
  return !!input.service;
}
