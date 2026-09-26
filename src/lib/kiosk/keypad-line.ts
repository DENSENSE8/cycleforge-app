/**
 * What one Keypad `+` puts on the cart — Square's "Keypad":
 * accepts it unapproved — operator decision 2026-09-24).
 * There is no note field above the pad (operator 2026-09-24: "remove the title
 */

import type { RepairPayload, RetailPayload } from './cart-line';

/** Square's line title for a keypad amount with no description. */
export const KEYPAD_LINE_TITLE = 'Custom Amount';

export type KeypadLine =
  | { kind: 'retail'; title: string; unitAmountCents: number; payload: RetailPayload }
  | { kind: 'repair'; title: string; unitAmountCents: number; payload: RepairPayload }
  | { kind: 'refused'; reason: string };

export function keypadLine(mode: 'retail' | 'repair', cents: number): KeypadLine {
  const unitAmountCents = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  if (unitAmountCents <= 0) return { kind: 'refused', reason: 'Type an amount first.' };
  if (mode === 'repair') {
    return {
      kind: 'repair',
      title: KEYPAD_LINE_TITLE,
      unitAmountCents,
      payload: {
        custom: true,
        productModel: KEYPAD_LINE_TITLE,
        sourceSku: null,
        serialNumber: '',
        price: (unitAmountCents / 100).toFixed(2),
      },
    };
  }
  return {
    kind: 'retail',
    title: KEYPAD_LINE_TITLE,
    unitAmountCents,
    payload: { variationId: null, sku: '', custom: true },
  };
}
