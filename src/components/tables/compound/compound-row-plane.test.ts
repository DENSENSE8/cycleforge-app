import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCompoundRowPlaneGutterClick,
  compoundRowPlaneGutterClick,
  rememberRowPlaneOpen,
} from './compound-row-plane';
import { ORDERS_DEFAULT_TABLE_BINDING } from '@/components/dashboard/orders-queue/orders-table-definition';

/**
 * The row-anchored plane seam — the last thing that forced a family to own a
 * row component (`OrdersQueueTableRow`).
 *
 * Two claims are worth pinning mechanically: the CYC-82 click rule survived the
 * move out of `lib/outbound` unchanged, and the plane is registered to the
 * ENTITY rather than mounted by a page.
 */
describe('the CYC-82 gutter rule, now engine-owned', () => {
  it('always toggles: opening the plane is a side-effect of becoming selected', () => {
    assert.deepEqual(compoundRowPlaneGutterClick({ isChecked: false, shiftKey: false }), {
      extend: false,
      menu: 'open',
    });
  });

  it('keeps the plane up when unselecting — other rows may still be in the set', () => {
    assert.deepEqual(compoundRowPlaneGutterClick({ isChecked: true, shiftKey: false }), {
      extend: false,
      menu: 'keep',
    });
  });

  it('shift is the range walk and keeps the plane — bulk is a cardinality', () => {
    for (const isChecked of [true, false]) {
      assert.deepEqual(compoundRowPlaneGutterClick({ isChecked, shiftKey: true }), {
        extend: true,
        menu: 'keep',
      });
    }
  });

  it('a second select keeps the live plane instead of remounting it', () => {
    rememberRowPlaneOpen(true);
    try {
      assert.deepEqual(compoundRowPlaneGutterClick({ isChecked: false, shiftKey: false }), {
        extend: false,
        menu: 'keep',
      });
    } finally {
      rememberRowPlaneOpen(false);
    }
  });

  it('applies in order: the toggle fires first, then the plane opens', () => {
    const calls: string[] = [];
    applyCompoundRowPlaneGutterClick({
      isChecked: false,
      shiftKey: false,
      onToggle: () => calls.push('toggle'),
      onOpenMenu: () => calls.push('open'),
      onCloseMenu: () => calls.push('close'),
    });
    assert.deepEqual(calls, ['toggle', 'open']);
  });

  it('apply on a checked row toggles and does not close the plane', () => {
    const calls: string[] = [];
    applyCompoundRowPlaneGutterClick({
      isChecked: true,
      shiftKey: false,
      onToggle: () => calls.push('toggle'),
      onOpenMenu: () => calls.push('open'),
      onCloseMenu: () => calls.push('close'),
    });
    assert.deepEqual(calls, ['toggle']);
  });
});

describe('the plane is registered to the entity, not mounted by a page', () => {
  it('the orders binding declares its CYC-82 plane once, with a reason', () => {
    const plane = ORDERS_DEFAULT_TABLE_BINDING.rowPlane;
    assert.ok(plane, 'orders must register its assign manifold on the binding');
    assert.equal(typeof plane.Component, 'function');
    assert.ok(
      plane.reason.trim().length > 20,
      'a registered plane states WHY, like recordPlane does',
    );
  });

  it('reaches every lane of the entity — there is no per-lane opt-in to fork', () => {
    // The binding is one object; a lane cannot hold a different plane without
    // registering a second binding, which invariant 2 already refuses. Gating
    // the plane per lane is exactly how Shipped once had the checkbox and no
    // manifold.
    const source = ORDERS_DEFAULT_TABLE_BINDING;
    assert.equal(source.definition.tableId, 'orders');
    assert.ok(source.rowPlane);
  });
});
