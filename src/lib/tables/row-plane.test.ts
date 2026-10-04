import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRowPlaneGutterClick, rememberRowPlaneOpen, rowPlaneGutterClick } from './row-plane';

/** The row-anchored plane seam — the last thing that forced a family to own a row component (`OrdersQueueTableRow`). */
describe('the CYC-82 gutter rule', () => {
  it('always toggles: opening the plane is a side-effect of becoming selected', () => {
    assert.deepEqual(rowPlaneGutterClick({ isChecked: false, shiftKey: false }), {
      extend: false,
      menu: 'open',
    });
  });

  it('keeps the plane up when unselecting — other rows may still be in the set', () => {
    assert.deepEqual(rowPlaneGutterClick({ isChecked: true, shiftKey: false }), {
      extend: false,
      menu: 'keep',
    });
  });

  it('shift is the range walk and keeps the plane — bulk is a cardinality', () => {
    for (const isChecked of [true, false]) {
      assert.deepEqual(rowPlaneGutterClick({ isChecked, shiftKey: true }), {
        extend: true,
        menu: 'keep',
      });
    }
  });

  it('a second select keeps the live plane instead of remounting it', () => {
    rememberRowPlaneOpen(true);
    try {
      assert.deepEqual(rowPlaneGutterClick({ isChecked: false, shiftKey: false }), {
        extend: false,
        menu: 'keep',
      });
    } finally {
      rememberRowPlaneOpen(false);
    }
  });

  it('applies in order: the toggle fires first, then the plane opens', () => {
    const calls: string[] = [];
    applyRowPlaneGutterClick({
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
    applyRowPlaneGutterClick({
      isChecked: true,
      shiftKey: false,
      onToggle: () => calls.push('toggle'),
      onOpenMenu: () => calls.push('open'),
      onCloseMenu: () => calls.push('close'),
    });
    assert.deepEqual(calls, ['toggle']);
  });
});
