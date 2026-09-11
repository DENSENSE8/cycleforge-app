/**
 * Pure projector for Ordered / Inbound / Unboxed / Allocated.
 * Callers: ordersItemStatus. No API. User: Implement the item-level OOS plan.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shortagePipelineFrom } from '@/lib/orders/shortage-pipeline';

describe('shortagePipelineFrom', () => {
  it('returns null when the line is not held', () => {
    assert.equal(shortagePipelineFrom({ isOutOfStock: false }), null);
  });

  it('projects Ordered from replenishment PO', () => {
    const view = shortagePipelineFrom({
      isOutOfStock: true,
      replenishmentStatus: 'po_created',
      poNumber: 'PO-99',
    });
    assert.equal(view?.stage, 'ordered');
    assert.equal(view?.label, 'Ordered · PO PO-99');
  });

  it('projects Inbound from receiving workflow', () => {
    const view = shortagePipelineFrom({
      isOutOfStock: true,
      inboundWorkflow: 'ARRIVED',
      poNumber: 'PO-1',
    });
    assert.equal(view?.stage, 'inbound');
    assert.equal(view?.label, 'Inbound · PO PO-1');
  });

  it('projects Unboxed then Allocated', () => {
    assert.equal(
      shortagePipelineFrom({ isOutOfStock: true, inboundWorkflow: 'UNBOXED' })?.stage,
      'received',
    );
    assert.equal(
      shortagePipelineFrom({
        isOutOfStock: true,
        linkStatus: 'allocated',
        qtyAllocated: 1,
        qtyShort: 1,
      })?.stage,
      'allocated',
    );
  });
});
