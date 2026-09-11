import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  deriveOrderExceptionBlockers,
  exceptionPairingResolveCount,
  exceptionRailMetaCount,
  sortExceptionQueueRows,
} from '@/lib/orders/order-exception-types';

/** Paired with an item number — the only facts this queue cares about. */
const CLEAN = {
  itemNumber: '01029',
  skuCatalogId: 2425,
};

describe('deriveOrderExceptionBlockers', () => {
  it('a paired order with an item number has no blockers', () => {
    assert.deepEqual(deriveOrderExceptionBlockers(CLEAN), []);
  });

  it('an unpaired SKU is a blocker even when paperwork could otherwise ship', () => {
    // The case that motivated this surface: 19 of 22 caged orders were
    // releasable-shaped but resolved to no catalog item. R-FLOW-7: missing
    // docs/labels are To-ship paperwork, not exception blockers.
    const blockers = deriveOrderExceptionBlockers({ ...CLEAN, skuCatalogId: null });
    assert.deepEqual(blockers, ['unpaired']);
  });

  it('names pairing facts independently', () => {
    const blockers = deriveOrderExceptionBlockers({
      itemNumber: '',
      skuCatalogId: null,
    });
    assert.deepEqual(blockers, ['unpaired', 'no_item_number']);
  });

  it('paperwork gaps are not exception blockers', () => {
    assert.deepEqual(
      deriveOrderExceptionBlockers({
        ...CLEAN,
        trackingNumber: null,
        linkedDocumentCount: 0,
        docsNotRequired: false,
        shippingLabelLinked: false,
        shippingLabelPurchased: false,
      } as typeof CLEAN),
      [],
    );
  });

  it('whitespace is absence — a blank item number still blocks', () => {
    assert.deepEqual(deriveOrderExceptionBlockers({ ...CLEAN, itemNumber: '   ' }), [
      'no_item_number',
    ]);
  });

  it('treats unknown facts as MISSING, never as satisfied', () => {
    assert.deepEqual(deriveOrderExceptionBlockers({}), ['unpaired', 'no_item_number']);
  });

  it('every blocker has an operator-facing label', () => {
    for (const blocker of deriveOrderExceptionBlockers({})) {
      assert.ok(
        ORDER_EXCEPTION_BLOCKER_LABEL[blocker]?.length > 0,
        `${blocker} needs a label`,
      );
    }
  });
});

describe('sortExceptionQueueRows', () => {
  it('counts this order plus unpaired siblings', () => {
    assert.equal(exceptionPairingResolveCount({ siblingUnpairedCount: 0 }), 1);
    assert.equal(exceptionPairingResolveCount({ siblingUnpairedCount: 3 }), 4);
  });

  it('puts the banner sibling count on the rail meta, not order qty', () => {
    assert.equal(
      exceptionRailMetaCount({ siblingUnpairedCount: 51, quantity: '1' }),
      '51',
    );
    assert.equal(
      exceptionRailMetaCount({ siblingUnpairedCount: 0, quantity: '3' }),
      '3',
    );
    assert.equal(
      exceptionRailMetaCount({ siblingUnpairedCount: 0, quantity: null }),
      '1',
    );
  });

  it('pins missing item numbers, then highest pair-once fan-out', () => {
    const sorted = sortExceptionQueueRows([
      { id: 1, blockers: ['unpaired'] as const, siblingUnpairedCount: 0 },
      { id: 2, blockers: ['unpaired'] as const, siblingUnpairedCount: 5 },
      { id: 3, blockers: ['unpaired', 'no_item_number'] as const, siblingUnpairedCount: 0 },
      { id: 4, blockers: ['unpaired'] as const, siblingUnpairedCount: 5 },
    ]);
    assert.deepEqual(sorted.map((r) => r.id), [3, 4, 2, 1]);
  });
});
