import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { EMPTY_PO_INTAKE_DRAFT } from './po-intake-draft';
import {
  closePoIntake,
  getActivePoIntakeDraft,
  getPoIntakeSnapshot,
  openPoIntake,
  placeExtractedPoOrder,
  removePoOrders,
} from './po-intake-store';

describe('po-intake-store queue', () => {
  beforeEach(() => {
    closePoIntake();
    openPoIntake({ reset: true });
  });

  it('placeExtractedPoOrder replaces a blank active order', () => {
    const id = placeExtractedPoOrder({
      ...EMPTY_PO_INTAKE_DRAFT(),
      orderId: 'A-1',
      trackingNumber: 'T',
      lines: [{ sku: 'S', itemName: '', quantity: '2', lineItemId: '', catalogId: null, listingUrl: '' }],
    });
    const snap = getPoIntakeSnapshot();
    assert.equal(snap.queue.length, 1);
    assert.equal(snap.activeOrderId, id);
    assert.equal(getActivePoIntakeDraft().orderId, 'A-1');
  });

  it('placeExtractedPoOrder appends when active already has content', () => {
    placeExtractedPoOrder({
      ...EMPTY_PO_INTAKE_DRAFT(),
      orderId: 'FIRST',
      trackingNumber: 'T1',
      lines: [{ sku: 'A', itemName: '', quantity: '1', lineItemId: '', catalogId: null, listingUrl: '' }],
    });
    placeExtractedPoOrder({
      ...EMPTY_PO_INTAKE_DRAFT(),
      orderId: 'SECOND',
      trackingNumber: 'T2',
      lines: [{ sku: 'B', itemName: '', quantity: '1', lineItemId: '', catalogId: null, listingUrl: '' }],
    });
    const snap = getPoIntakeSnapshot();
    assert.equal(snap.queue.length, 2);
    assert.equal(getActivePoIntakeDraft().orderId, 'SECOND');
  });

  it('removePoOrders leaves one empty shell when clearing all', () => {
    placeExtractedPoOrder({
      ...EMPTY_PO_INTAKE_DRAFT(),
      orderId: 'ONLY',
      trackingNumber: 'T',
      lines: [{ sku: 'A', itemName: '', quantity: '1', lineItemId: '', catalogId: null, listingUrl: '' }],
    });
    const ids = getPoIntakeSnapshot().queue.map((o) => o.id);
    removePoOrders(ids);
    const snap = getPoIntakeSnapshot();
    assert.equal(snap.queue.length, 1);
    assert.equal(getActivePoIntakeDraft().orderId, '');
  });
});
