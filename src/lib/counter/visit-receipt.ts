/**
 * visit-receipt — the CUSTOMER-facing document model for a counter visit.
 *
 * `loadCounterVisit` (read-visit.ts) is the OPERATOR ledger: every line,
 * voided or not, every audit row, both payment answers. A receipt is a
 * different document handed to a different reader, and the two must not be
 * the same object wearing a different template:
 *
 *   - A voided `counter_session_lines` row is evidence for the desk. It is
 *     NOT something the customer paid for, so it is dropped here — the one
 *     deliberate divergence from the operator view (see `lineItems` below).
 *   - The repair section is built from `visit.devices` (the `repair_service`
 *     rows), never from `visit.lines`. A session-originated repair visit has
 *     BOTH — a `counter_session_lines` row of type `REPAIR` (the cart's own
 *     ledger entry) and the `repair_service` row it produced (the work
 *     order) — and printing both would bill the same repair twice on paper.
 *     `devices` carries the RS number and the canonically-parsed quote;
 *     `lines` does not. Devices wins.
 *   - `visit.payment.sessionPaymentState` (the TERMINAL's answer) never
 *     appears here. A receipt reports what was actually charged — the
 *     `square_transactions` row — not a Terminal state that can legitimately
 *     disagree with it before the settlement webhook lands.
 *
 * PURE. No React, no HTML, no I/O — this module never imports `@/lib/db` or
 * anything that touches a socket. `buildVisitReceipt` takes the tenant's
 * `OrgLetterhead` (src/lib/branding/letterhead.ts — the SAME shop-identity
 * source the printed repair paper uses) as an argument rather than resolving
 * one itself, so the pricing/inclusion rules below are exercised with zero
 * DB in visit-receipt.test.ts.
 */

import type { OrgLetterhead } from '@/lib/branding/letterhead';
import type { CounterTransactionStatus } from './counter-transaction-types';
import type { CounterVisit, CounterVisitCustomer, CounterVisitLine } from './read-visit';

// ── The document model ──────────────────────────────────────────────────────

/** One retail or buyback line as printed — never a repair (see module doc). */
export interface VisitReceiptLineItem {
  id: string;
  title: string;
  /** BUYBACK lines print as a credit. */
  kind: 'retail' | 'buyback';
  quantity: number;
  /** Minor units. Negative for a buyback credit. */
  unitAmountCents: number;
  /** quantity × unitAmountCents. */
  extendedAmountCents: number;
}

/** One device taken in for repair, as printed. Sourced from `visit.devices` only. */
export interface VisitReceiptRepairItem {
  id: number;
  rsNumber: string;
  productTitle: string;
  serialNumber: string;
  /** Canonically parsed via `serviceLineCents` upstream (read-visit.ts) — never re-parsed here. */
  quoteCents: number;
  /** `repair_service.price` as recorded, for a quote that never disagrees with what was signed for. */
  quoteRaw: string;
}

export interface VisitReceiptCustomer {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface VisitReceiptPayment {
  status: CounterTransactionStatus;
  /** `square_transactions.payment_method`, passed through as recorded. Null when nothing has settled yet. */
  tender: string | null;
  /** What the settled square_transactions row actually collected. 0 when nothing has been charged. */
  amountPaidCents: number;
  /** `totalCents - amountPaidCents`, floored at 0. Zero for `paid` and `voided` — a voided visit owes nothing. */
  amountDueCents: number;
  /** `square_transactions.tax`, when a settled payment carries one. Never computed locally — see counter-transaction-types.ts. */
  taxCents: number | null;
  /** Square's own hosted receipt, when the payment has one. */
  receiptUrl: string | null;
}

export interface VisitReceipt {
  header: OrgLetterhead;
  visitId: number;
  /** PST-normalized, already formatted for a human by read-visit.ts. */
  visitDate: string | null;
  customer: VisitReceiptCustomer | null;
  lineItems: VisitReceiptLineItem[];
  repairs: VisitReceiptRepairItem[];
  /** Retail + buyback only — mirrors `counter_transactions.subtotal_cents` (see computeCounterTotals). */
  subtotalCents: number;
  /** subtotal + every repair quote — mirrors `counter_transactions.total_cents`. */
  totalCents: number;
  payment: VisitReceiptPayment;
  /**
   * What a scanner reads off the printed copy: the single device's RS number
   * when there is exactly one, otherwise the visit itself (`CT-{id}`) — a
   * multi-device or retail-only visit has no single RS number to stand in
   * for the whole receipt.
   */
  barcodeValue: string;
  footer: string;
}

// ── Line-item extraction ────────────────────────────────────────────────────

function isBillableRetailLine(line: CounterVisitLine): boolean {
  // Voided lines are evidence for the desk, not something the customer paid
  // for — dropped here, the one deliberate divergence from the operator view.
  if (line.voidedAt) return false;
  // REPAIR-type lines are the cart's own ledger entry for a device already
  // printed from `visit.devices` below. Printing both double-bills it.
  return line.type === 'RETAIL' || line.type === 'BUYBACK';
}

function toLineItem(line: CounterVisitLine): VisitReceiptLineItem {
  const quantity = Number.isFinite(line.quantity) ? line.quantity : 0;
  const unitAmountCents = Number.isFinite(line.unitAmountCents) ? line.unitAmountCents : 0;
  return {
    id: line.id,
    title: line.title,
    kind: line.type === 'BUYBACK' ? 'buyback' : 'retail',
    quantity,
    unitAmountCents,
    extendedAmountCents: quantity * unitAmountCents,
  };
}

// ── Payment summary ─────────────────────────────────────────────────────────

/**
 * What to print for "paid" and "still owed".
 *
 * `paid`/`voided` never show a balance — a voided visit was cancelled, not
 * partially collected, so it owes nothing rather than "totalCents short by
 * whatever a stray square_transactions row happens to record". Every other
 * status reports exactly what the (at most one) settled square_transactions
 * row collected, which is the money's own answer — never the Terminal's
 * `sessionPaymentState` (see module doc).
 */
function paymentSummary(visit: CounterVisit): VisitReceiptPayment {
  const sq = visit.payment.squareTransaction;
  const tender = sq?.paymentMethod ?? null;
  const receiptUrl = sq?.receiptUrl ?? null;
  const taxCents = sq?.taxCents ?? null;

  if (visit.status === 'voided') {
    return { status: visit.status, tender, amountPaidCents: 0, amountDueCents: 0, taxCents, receiptUrl };
  }
  if (visit.status === 'paid') {
    const amountPaidCents = sq?.totalCents ?? visit.totalCents;
    return { status: visit.status, tender, amountPaidCents, amountDueCents: 0, taxCents, receiptUrl };
  }

  // staged / abandoned / partially_paid: whatever has actually settled, if
  // anything, against what the visit is staged for.
  const amountPaidCents = sq?.totalCents ?? 0;
  const amountDueCents = Math.max(0, visit.totalCents - amountPaidCents);
  return { status: visit.status, tender, amountPaidCents, amountDueCents, taxCents, receiptUrl };
}

// ── Barcode value ────────────────────────────────────────────────────────────

function barcodeValueFor(visit: CounterVisit): string {
  if (visit.devices.length === 1) return visit.devices[0].rsNumber || `CT-${visit.id}`;
  return `CT-${visit.id}`;
}

// ── Footer ───────────────────────────────────────────────────────────────────

const REPAIR_WARRANTY_NOTE = 'There is a 30 day warranty on all repair services.';
const THANK_YOU_NOTE = 'Thank you for your business!';

function footerFor(visit: CounterVisit): string {
  return visit.devices.length > 0 ? `${THANK_YOU_NOTE} ${REPAIR_WARRANTY_NOTE}` : THANK_YOU_NOTE;
}

// ── Entry point ──────────────────────────────────────────────────────────────

function toCustomer(customer: CounterVisitCustomer | null): VisitReceiptCustomer | null {
  if (!customer) return null;
  return { name: customer.name, phone: customer.phone, email: customer.email };
}

/** Build the printable document model for a loaded counter visit. Pure — no I/O. */
export function buildVisitReceipt(visit: CounterVisit, header: OrgLetterhead): VisitReceipt {
  return {
    header,
    visitId: visit.id,
    visitDate: visit.createdAt,
    customer: toCustomer(visit.customer),
    lineItems: visit.lines.filter(isBillableRetailLine).map(toLineItem),
    repairs: visit.devices.map((d) => ({
      id: d.id,
      rsNumber: d.rsNumber,
      productTitle: d.productTitle,
      serialNumber: d.serialNumber,
      quoteCents: d.quoteCents,
      quoteRaw: d.quoteRaw,
    })),
    subtotalCents: visit.subtotalCents,
    totalCents: visit.totalCents,
    payment: paymentSummary(visit),
    barcodeValue: barcodeValueFor(visit),
    footer: footerFor(visit),
  };
}
