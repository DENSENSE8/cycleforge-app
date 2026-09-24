/**
 *   node --import tsx --test src/lib/kiosk/cart-card-view.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cartLineCardView, stepCartQuantity } from './cart-card-view';
import { retailQuantitiesByVariation, type KioskCartLine } from './cart-line';

function sale(overrides: Partial<KioskCartLine> = {}): KioskCartLine {
  return {
    id: 's1',
    type: 'RETAIL',
    title: 'USB-C cable',
    quantity: 2,
    unitAmountCents: 428,
    payload: { variationId: '812345678', sku: '00162' },
    ...overrides,
  };
}

describe('stepCartQuantity', () => {
  it('asks before removing when − is pressed at 1', () => {
    assert.deepEqual(stepCartQuantity(1, -1), { kind: 'confirm-remove' });
  });

  it('steps within bounds and stops at the intake maximum', () => {
    assert.deepEqual(stepCartQuantity(2, -1), { kind: 'set', quantity: 1 });
    assert.deepEqual(stepCartQuantity(999, 1), { kind: 'set', quantity: 999 });
  });

  it('treats a corrupt quantity as 1 rather than stepping from NaN', () => {
    assert.deepEqual(stepCartQuantity(Number.NaN, 1), { kind: 'set', quantity: 2 });
  });
});

describe('cartLineCardView — sale line', () => {
  it('reads `Sale · SKU 00162` then `2 · $8.56`, with no storefront item id', () => {
    const view = cartLineCardView(sale());
    assert.equal(view.stateLabel, 'Sale');
    assert.deepEqual(view.primaryId, { label: 'SKU', value: '00162' });
    assert.equal(view.secondaryId, null);
    assert.equal(`${view.quantity} · ${view.amount}`, '2 · $8.56');
    assert.equal(view.steppable, true);
  });

  it('never offers a stepper on a repair or a trade-in', () => {
    const repair = cartLineCardView(
      sale({ type: 'REPAIR', payload: { productModel: 'Radio', serialNumber: 'SN1', price: '10' } }),
    );
    const tradeIn = cartLineCardView(sale({ type: 'BUYBACK', payload: { imei: '3569' } }));
    assert.equal(repair.steppable, false);
    assert.equal(tradeIn.steppable, false);
  });
});

describe('retailQuantitiesByVariation', () => {
  it('sums every line on one catalog id, so a tile shows the whole count', () => {
    const counts = retailQuantitiesByVariation([
      sale({ id: 'a', quantity: 2 }),
      sale({ id: 'b', quantity: 1, unitAmountCents: 300 }),
      sale({ id: 'c', payload: { variationId: null, sku: '' } }),
    ]);
    assert.deepEqual([...counts], [['812345678', 3]]);
  });
});
