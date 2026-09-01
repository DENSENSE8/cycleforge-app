import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  deriveOrderExceptionBlockers,
} from '@/lib/orders/order-exception-types';

/** A fully-resolved order: paired, identified, tracked, documented, labelled. */
const CLEAN = {
  itemNumber: '01029',
  trackingNumber: '1Z999AA10123456784',
  skuCatalogId: 2425,
  linkedDocumentCount: 1,
  docsNotRequired: false,
  shippingLabelLinked: true,
  shippingLabelPurchased: false,
};

describe('deriveOrderExceptionBlockers', () => {
  it('a fully-resolved order has no blockers', () => {
    assert.deepEqual(deriveOrderExceptionBlockers(CLEAN), []);
  });

  it('an unpaired SKU is a blocker even when the order could otherwise ship', () => {
    // The case that motivated this surface: 19 of 22 caged orders were
    // releasable-shaped but resolved to no catalog item, so they had no item
    // display. Since the 2026-08-31 flow ruling (R-FLOW-1) pairing is ALSO
    // release gate G4 — this blocker is its finer-grained triage twin, and
    // the two must agree.
    const blockers = deriveOrderExceptionBlockers({ ...CLEAN, skuCatalogId: null });
    assert.deepEqual(blockers, ['unpaired']);
  });

  it('names every missing fact independently', () => {
    const blockers = deriveOrderExceptionBlockers({
      itemNumber: '',
      trackingNumber: null,
      skuCatalogId: null,
      linkedDocumentCount: 0,
      docsNotRequired: false,
      shippingLabelLinked: false,
      shippingLabelPurchased: false,
    });
    assert.deepEqual(blockers, [
      'unpaired',
      'no_item_number',
      'no_tracking',
      'no_docs',
      'no_label',
    ]);
  });

  it('an explicit docs exemption clears the documents blocker', () => {
    const blockers = deriveOrderExceptionBlockers({
      ...CLEAN,
      linkedDocumentCount: 0,
      docsNotRequired: true,
    });
    assert.deepEqual(blockers, []);
  });

  it('a purchased label clears the label blocker just as a linked one does', () => {
    const blockers = deriveOrderExceptionBlockers({
      ...CLEAN,
      shippingLabelLinked: false,
      shippingLabelPurchased: true,
    });
    assert.deepEqual(blockers, []);
  });

  it('whitespace is absence — a blank item number still blocks', () => {
    const blockers = deriveOrderExceptionBlockers({ ...CLEAN, itemNumber: '   ' });
    assert.deepEqual(blockers, ['no_item_number']);
  });

  it('treats unknown facts as MISSING, never as satisfied', () => {
    // Same discipline as the gates: "we did not look" and "it is not there"
    // must land on the same side, or a half-known order reaches the floor.
    assert.deepEqual(deriveOrderExceptionBlockers({}), [
      'unpaired',
      'no_item_number',
      'no_tracking',
      'no_docs',
      'no_label',
    ]);
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
