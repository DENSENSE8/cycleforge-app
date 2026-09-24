/**
 * What a walk-in visit owes, and WHEN — the two numbers the cart's last step
 * states.
 *
 * ## The ruling
 *
 * Operator 2026-09-15: *"a repair service on drop off never takes money off, it
 * just prints out a receipt."* So a service quote is never due at the counter
 * on the way in; goods are. A visit can carry both (drop off a receiver, buy a
 * cable on the way out), and the cart has to say which half is payable now
 * without inventing a second transaction for it.
 *
 * ## Why this is display + key selection, never a wire field
 *
 * The kiosk does not charge at all — plan D4: it STAGES a Square order and the
 * payment arrives later through the webhook, where
 * `reconcileCounterPayment` → `statusForPayment` already models a short payment
 * as `partially_paid` ("a deposit, a split tender"), and the receipt already
 * prints *"Partially paid — balance due"*. A mixed visit therefore needs no new
 * settlement model: one header, staged at the full total, paid in two moments.
 *
 * Splitting a mixed visit into two transactions — or adding a deposit amount to
 * the intake body — would fork the single header that reconciliation keys on.
 * That column shipped once with no reader and left every counter sale at
 * `staged` while the money was in the bank; do not build the second instance of
 * that bug.
 *
 * Pure over the cart lines: no store, no network, no React.
 * Callers: `KioskCartLedger` (Review step + which key it shows).
 * Affected API: none. Schemas: none.
 */

import type { KioskCartLine } from '@/lib/kiosk/cart-line';

export interface KioskCartMoney {
  /**
   * GOODS, signed. Retail adds; a trade-in credit subtracts, so this can be
   * negative — that is a payout to the customer, not a charge.
   */
  dueNowCents: number;
  /** SERVICE quotes. Collected when the customer collects the device. */
  dueAtPickupCents: number;
  /** Everything the visit is staged at — what the header carries. */
  totalCents: number;
  /**
   * Whether the counter takes money on this visit at all.
   *
   * False for a service-only drop-off (nothing is payable yet) and false for a
   * pure trade-in (the money moves the other way). The cart shows its Pay key
   * only when this is true; otherwise the one key checks the visit in and the
   * receipt is the artifact.
   */
  takesPaymentNow: boolean;
}

function lineUnits(line: KioskCartLine): number {
  return Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
}

function lineTotalCents(line: KioskCartLine): number {
  const unit = Number.isFinite(line.unitAmountCents) ? Math.trunc(line.unitAmountCents) : 0;
  return lineUnits(line) * unit;
}

/**
 * Whole units on the cart — the `N` of every `N · $total` header (a line of two
 * cables counts as two). One count, so the cart and the Keypad cannot differ.
 */
export function cartUnitCount(lines: readonly KioskCartLine[]): number {
  return lines.reduce((sum, line) => sum + lineUnits(line), 0);
}

export function cartMoneySplit(lines: readonly KioskCartLine[]): KioskCartMoney {
  let dueNowCents = 0;
  let dueAtPickupCents = 0;

  for (const line of lines) {
    const cents = lineTotalCents(line);
    if (line.type === 'REPAIR') dueAtPickupCents += cents;
    else dueNowCents += cents;
  }

  return {
    dueNowCents,
    dueAtPickupCents,
    totalCents: dueNowCents + dueAtPickupCents,
    takesPaymentNow: dueNowCents > 0,
  };
}
