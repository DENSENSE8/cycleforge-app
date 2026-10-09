/** Counter-transaction contract — the shape `submitCounterTransaction` accepts and returns. */

/** A line price the catalog did not set (Square "Price adjustment", "Keypad" and "Comp"). */
export const PRICE_ADJUST_KINDS = ['adjust', 'custom', 'comp'] as const;
export type PriceAdjustKind = (typeof PRICE_ADJUST_KINDS)[number];

export interface CounterPriceAdjustment {
  kind: PriceAdjustKind;
  /** The catalog price before the change; `null` for a custom amount. */
  originalUnitAmountCents: number | null;
  reason: string;
  staffId: number;
  /**
   * The server-signed approval the kiosk route verifies (`kiosk/price-approval`).
   * The kiosk route REBUILDS this whole object from the verified claims, so
   * nothing else in it is trusted from a tablet.
   */
  approval?: string | null;
}

/** One retail line staged at the counter. */
export interface CounterRetailLine {
  /** Ecwid listing id, kept for reporting only; never sent to Square. `null` = manual line. */
  variationId: string | null;
  sku: string;
  productTitle: string;
  quantity: number;
  /** Unit price in minor units (cents). Negative = buyback / trade-in credit. */
  unitAmountCents: number;
  /** Set when the price is not the catalog's; see {@link CounterPriceAdjustment}. */
  priceAdjustment?: CounterPriceAdjustment | null;
  /** Item note (Square `OrderLineItem.note`, ≤ 2000). Prints on the receipt. */
  note?: string | null;
}

/** The service (repair) half of a counter visit. */
export interface CounterServiceLine {
  productType?: string | null;
  /** Required by submitRepairIntake as `product.model`. */
  productModel: string;
  sourceSku?: string | null;
  repairReasons?: string[];
  repairNotes?: string | null;
  serialNumber: string;
  price: string;
  /** The quote in minor units, when the caller already has it as an integer. */
  unitAmountCents?: number | null;
  notes?: string | null;
  assignedTechId?: number | null;
  signatureDataUrl?: string | null;
  signatureStrokes?: unknown;
  /** A re-quote authorized at the counter; the adjusted quote is `price`. */
  priceAdjustment?: CounterPriceAdjustment | null;
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
  /** The visit's ship-to, encoded by `encodeShipToAddress` (lib/customers/ship-to-address). Written to `customers.shipping_*` field by field. */
  address?: string | null;
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

/** An EXISTING `repair_service` row brought into this visit — an Ecwid drop-off or desk ticket that never went through a tablet cart. */
export interface CounterLinkedRepairInput {
  repairId: number;
}

export interface CounterTransactionInput {
  customer: CounterCustomerInput;
  retailLines?: CounterRetailLine[];
  /** Every device dropped off in this visit. */
  services?: CounterServiceLine[];
  /** Existing repairs this visit settles or carries. */
  linkedRepairs?: CounterLinkedRepairInput[];
  priorOrder?: CounterPriorOrderInput | null;
  ticketWork?: CounterTicketWorkInput;
  /** Idempotency anchor for the WHOLE transaction — not just the ticket call. */
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

/** One device checked in. */
export interface CounterRepairOutcome {
  id: number;
  rsNumber: string;
  /** Null when the helpdesk was unreachable — the outbox will land it later. */
  ticketNumber: string | null;
  documentId: number | null;
  signatureUrl: string | null;
  /** The ONE product this row is for — never a joined list of a visit's units. */
  productTitle: string;
  serialNumber: string;
  /** Same integer the header total was built from (`serviceLineCents`). */
  priceCents: number;
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
  /**
   * One outcome per device taken in. Empty when the visit was retail-only —
   * and empty on an idempotent replay, which reports the ORIGINAL transaction
   * rather than re-deriving sub-writes it deliberately did not perform.
   */
  repairs: CounterRepairOutcome[];
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

/** Sum the staged lines, in cents. */
export function computeCounterTotals(input: {
  retailLines?: CounterRetailLine[];
  services?: CounterServiceLine[];
}): { subtotalCents: number; totalCents: number } {
  const subtotalCents = (input.retailLines ?? []).reduce((sum, line) => {
    const qty = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
    // Allow negative unit amounts (kiosk BUYBACK / trade-in credits). Do not
    // clamp with Math.max(0) — that silently ate trade-in credits.
    const unit = Number.isFinite(line.unitAmountCents) ? Math.trunc(line.unitAmountCents) : 0;
    return sum + qty * unit;
  }, 0);

  // Every device is quoted separately, so the visit total is their sum. A
  // single `serviceLineCents` here was the shape that made a second drop-off
  // invisible on the receipt as well as in the ledger.
  const serviceCents = (input.services ?? []).reduce(
    (sum, service) => sum + serviceLineCents(service),
    0,
  );

  return { subtotalCents, totalCents: subtotalCents + serviceCents };
}

/** A repair quote in cents. */
export function serviceLineCents(service?: CounterServiceLine | null): number {
  if (!service) return 0;
  const carried = service.unitAmountCents;
  if (typeof carried === 'number' && Number.isFinite(carried) && carried >= 0) {
    return Math.trunc(carried);
  }
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
export function requiresSignature(input: { services?: CounterServiceLine[] }): boolean {
  // Any device taken in needs the customer's signature. With N devices this is
  // still one boolean for the DRAFT form (which holds one signature); the
  // session path gates per line instead — see submitBlocker in session-store.ts.
  return (input.services?.length ?? 0) > 0;
}
