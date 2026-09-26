/**
 * What a walk-in visit owes, and WHEN — the two numbers the cart's last step states.
 * Operator 2026-09-15: *"a repair service on drop off never takes money off, it
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
  /** Whether the counter takes money on this visit at all. */
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
