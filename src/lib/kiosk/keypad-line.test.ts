/** The Keypad's contract with submit: */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KEYPAD_LINE_TITLE, keypadLine, type KeypadLine } from './keypad-line';
import { mapKioskCartToCounterParts } from './cart-to-counter';
import { verifyLinePrices } from './price-approval';
import type { KioskCartLine } from './cart-line';

const noApprovals = {
  verify: () => null,
  catalogPrices: async () => new Map<string, number>(),
};

function toCartLine(built: KeypadLine): KioskCartLine {
  assert.notEqual(built.kind, 'refused');
  if (built.kind === 'refused') throw new Error('unreachable');
  return {
    id: 'l1',
    type: built.kind === 'repair' ? 'REPAIR' : 'RETAIL',
    title: built.title,
    quantity: 1,
    unitAmountCents: built.unitAmountCents,
    payload: built.payload,
  } as KioskCartLine;
}

describe('keypadLine → submit', () => {
  it('a Sales `+` reaches submit as an unapproved Custom Amount at its own price', async () => {
    const parts = mapKioskCartToCounterParts([toCartLine(keypadLine('retail', 1250))]);
    const out = await verifyLinePrices(parts, noApprovals);
    assert.deepEqual(
      out.retailLines.map((l) => [l.productTitle, l.unitAmountCents, l.priceAdjustment]),
      [[KEYPAD_LINE_TITLE, 1250, null]],
    );
  });

  it('a Repair `+` reaches submit as a hand-priced device, unapproved', async () => {
    const parts = mapKioskCartToCounterParts([toCartLine(keypadLine('repair', 4900))]);
    const out = await verifyLinePrices(parts, noApprovals);
    assert.deepEqual(
      out.services.map((s) => [s.productModel, s.priceAdjustment]),
      [[KEYPAD_LINE_TITLE, null]],
    );
  });

  it('a $0.00 `+` adds nothing', () => {
    assert.equal(keypadLine('retail', 0).kind, 'refused');
  });
});
