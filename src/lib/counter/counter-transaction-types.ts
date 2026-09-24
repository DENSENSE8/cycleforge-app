/**
 * Counter-transaction contract — the shape `submitCounterTransaction` accepts
 * and returns.
 *
 * This module is deliberately **pure**: types, the status vocabulary, and
 * DB-free total math. No DB import, no server-only import, no vendor SDK — so
 * the kiosk form (a client component) and the server orchestrator can both
 * import it without either dragging the other's graph into its bundle
 * (bundle altitude).
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
 * A line price the catalog did not set (Square "Price adjustment", "Keypad"
 * and "Comp"). Every one is authorized by a staff PIN holding
 * `walk_in.adjust_price`.
 *
 *   - `adjust` — a catalog price changed (`originalUnitAmountCents` = catalog).
 *   - `custom` — a keypad amount; there was no catalog price (`null`).
 *   - `comp`   — kept on the bill at $0 with a reason (a comped item).
 */
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

/**
 * One retail line staged at the counter.
 *
 * Every line stages to Square ad-hoc (name + amount): `variationId` is the
 * Ecwid listing id, which Square cannot resolve (see `buildStageOrderBody`).
 *
 * This shape was modelled on the walk-in `SalesCartLine`, and the docblock used
 * to claim the kiosk *composed* that store "rather than forking a second cart".
 * It never did — the counter has always carried its own `CounterDraft.retailLines`
 * and imported nothing from it. `salesCartStore.ts` was deleted 2026-08-02 with
 * zero consumers, so this is now the only counter cart, which is what the
 * original claim was reaching for.
 */
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
  /**
   * The quote in minor units, when the caller already has it as an integer.
   *
   * `price` is and stays the TEXT the `repair_service.price` column holds — but
   * a text column is not a thing you can put on a card. The kiosk cart already
   * carries `unitAmountCents` for every line and the mapper used to throw the
   * repair one away, so the only number the money path could reach was whatever
   * `serviceLineCents` managed to scrape back out of the string. Carrying the
   * integer alongside the string means the staged order and the header total
   * are the SAME number rather than two independent parses of one quote.
   *
   * Optional because a repair created anywhere but the kiosk cart (the staff
   * intake form, an import) still only has the string. Absent → parse `price`.
   */
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
  /** Callers: submitCounterTransaction, POST /api/kiosk/intake. Schema: customers.shipping_address_1. User: "intake their information like name, email address, phone number, address". */
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

export interface CounterTransactionInput {
  customer: CounterCustomerInput;
  retailLines?: CounterRetailLine[];
  /**
   * Every device dropped off in this visit. Empty for a retail-only visit.
   *
   * **Was `service` (singular) until 2026-08-21.** The mapper kept only the
   * FIRST repair line and counted the rest into an `extraRepairCount` nobody
   * consumed, so a customer dropping off two devices silently lost one — no
   * error, and a receipt that looked correct.
   *
   * The DB never required that: `repair_service.counter_transaction_id` is a
   * many→one link and `counter_transactions` has no repair column at all. The
   * 1:1 lived only here.
   *
   * The singular field was REMOVED rather than kept as an alias, deliberately:
   * a defaulted or aliased shape is a silent opt-out that every call site
   * nobody visited takes automatically (`backend-patterns.md` → *A safety
   * classification is a REQUIRED parameter*). Removing it makes the compiler
   * name every site instead.
   */
  services?: CounterServiceLine[];
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

/**
 * One device checked in.
 *
 * It carries the device FACTS (title, serial, money) and not just the RS
 * number because the success screen is the receipt the customer is read back:
 * "RS-1042 · Wave Radio II · serial 0483221 · $168.00". Zipping the outcomes
 * against the cart the client happened to submit — by array index — is the
 * version of this that breaks the first time a device fails mid-visit and the
 * outcome list is shorter than the cart.
 */
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

/**
 * A repair quote in cents.
 *
 * Prefers `unitAmountCents` when the caller carried the integer through, and
 * falls back to parsing `repair_service.price` — a text column holding things
 * like `"130"`, `"$130.00"`, `"130.50"`. Returns 0 for anything unparseable.
 *
 * ONE function, deliberately: the header total and the staged provider order
 * are both built from this, so they cannot disagree about what a device costs.
 * Two parses of one quote is exactly how a visit ends up `partially_paid` with
 * nobody at the counter any the wiser.
 *
 * A negative or non-integral `unitAmountCents` is ignored rather than trusted —
 * a repair is never a credit (that is what a BUYBACK retail line is for), and a
 * fractional cent on a card is not a thing.
 */
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
