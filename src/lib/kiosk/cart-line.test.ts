/**
 *   npx tsx --test src/lib/kiosk/cart-line.test.ts src/lib/kiosk/cart-to-counter.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeKioskCartTotals,
  cartHasRepairLine,
  type KioskCartLine,
} from './cart-line';
import { mapKioskCartToCounterParts } from './cart-to-counter';
import { computeCounterTotals } from '@/lib/counter/counter-transaction-types';

function retail(overrides: Partial<KioskCartLine> = {}): KioskCartLine {
  return {
    id: 'r1',
    type: 'RETAIL',
    title: 'Case',
    quantity: 1,
    unitAmountCents: 1999,
    payload: { variationId: 'v1', sku: 'CASE-1' },
    ...overrides,
  };
}

function repair(overrides: Partial<KioskCartLine> = {}): KioskCartLine {
  return {
    id: 's1',
    type: 'REPAIR',
    title: 'QC35 II',
    quantity: 1,
    unitAmountCents: 13000,
    payload: {
      productModel: 'QC35 II',
      serialNumber: 'SN1',
      price: '130',
    },
    ...overrides,
  };
}

function buyback(overrides: Partial<KioskCartLine> = {}): KioskCartLine {
  return {
    id: 'b1',
    type: 'BUYBACK',
    title: 'Buyback · 7518',
    quantity: 1,
    unitAmountCents: -5000,
    payload: { imei: '490154203237518' },
    ...overrides,
  };
}

describe('computeKioskCartTotals', () => {
  it('sums retail + repair and subtracts buyback credits', () => {
    const { totalCents } = computeKioskCartTotals([retail(), repair(), buyback()]);
    assert.equal(totalCents, 1999 + 13000 - 5000);
  });

  it('handles empty cart', () => {
    assert.deepEqual(computeKioskCartTotals([]), { subtotalCents: 0, totalCents: 0 });
  });
});

describe('cartHasRepairLine', () => {
  it('detects REPAIR lines', () => {
    assert.equal(cartHasRepairLine([retail()]), false);
    assert.equal(cartHasRepairLine([retail(), repair()]), true);
  });
});

describe('computeCounterTotals — negative buyback', () => {
  it('does not clamp trade-in credits to zero', () => {
    const { subtotalCents, totalCents } = computeCounterTotals({
      retailLines: [
        {
          variationId: null,
          sku: 'BUYBACK',
          productTitle: 'Buyback',
          quantity: 1,
          unitAmountCents: -5000,
        },
        {
          variationId: 'v1',
          sku: 'CASE',
          productTitle: 'Case',
          quantity: 1,
          unitAmountCents: 1999,
        },
      ],
      service: null,
    });
    assert.equal(subtotalCents, -5000 + 1999);
    assert.equal(totalCents, -3001);
  });
});

describe('mapKioskCartToCounterParts', () => {
  it('maps retail + buyback + EVERY repair', () => {
    const mapped = mapKioskCartToCounterParts([
      retail(),
      buyback(),
      repair(),
      repair({ id: 's2', title: 'Extra' }),
    ]);
    assert.equal(mapped.retailLines.length, 2);
    assert.equal(mapped.retailLines[1]?.unitAmountCents, -5000);
    assert.ok(mapped.services[0]);
    assert.equal(mapped.services[0]?.productModel, 'QC35 II');
    // Was `extraRepairCount === 1` — an assertion that pinned the silent drop as
    // correct behaviour. Both devices now map (SQ6).
    assert.equal(mapped.services.length, 2);
  });

  it('carries the cart line unitAmountCents onto the mapped service — was discarded until 2026-08-22', () => {
    // The cart line's cents is the number the kiosk screen already totalled
    // with. Losing it here forced `serviceLineCents` onto its fallback —
    // parsing `repair_service.price`, a second, independent read of the same
    // quote — for every kiosk-originated repair, not just the malformed ones
    // the fallback exists for.
    const mapped = mapKioskCartToCounterParts([repair({ unitAmountCents: 13000 })]);
    assert.equal(mapped.services[0]?.unitAmountCents, 13000);
  });
});
