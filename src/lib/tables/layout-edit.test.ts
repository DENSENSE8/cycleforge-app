/**
 * Fields-picker editing laws: one gesture binds or unbinds, ↑/↓ rewrites a
 * band's binding order, bands fill to their budgets with the exact limit
 * copy, and locked kinds refuse.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldCatalog, FieldDef } from './field-catalog/types';
import { moveFieldBinding, slotFieldOptions, toggleFieldBinding } from './layout-edit';
import { MAX_STATUS_SLOTS, slotLimitMessage, type SlotLayout } from './slot-layout-core';

const IDENTITY: FieldDef = {
  id: 'orders.order_id', family: 'orders', label: 'Order', displayType: 'id', slotKinds: ['identity'],
};
const TESTED: FieldDef = {
  id: 'orders.picked', family: 'orders', label: 'Pick', displayType: 'stage_event', slotKinds: ['status'],
};
const PACKED: FieldDef = {
  id: 'orders.packed', family: 'orders', label: 'Packed', displayType: 'stage_event', slotKinds: ['status'],
};
const QTY: FieldDef = {
  id: 'orders.qty', family: 'orders', label: 'Qty', displayType: 'number', slotKinds: ['subtitle'],
};
const NOTES: FieldDef = {
  id: 'orders.notes', family: 'orders', label: 'Notes', displayType: 'note', slotKinds: ['subtitle'],
};
const AMOUNT: FieldDef = {
  id: 'orders.amount', family: 'orders', label: 'Amount', displayType: 'money', slotKinds: ['amount'],
};
const CATALOG: FieldCatalog = [IDENTITY, TESTED, PACKED, QTY, NOTES, AMOUNT];

function layout(overrides: Partial<SlotLayout> = {}): SlotLayout {
  return {
    morph: 'compound',
    identityFieldId: 'orders.order_id',
    statusBindings: [{ fieldId: 'orders.picked' }],
    subtitleBindings: [],
    amountFieldId: null,
    ...overrides,
  };
}

describe('toggleFieldBinding', () => {
  it('binds an unbound status field into the next free slot', () => {
    const result = toggleFieldBinding(layout(), PACKED);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.layout.statusBindings, [
      { fieldId: 'orders.picked' },
      { fieldId: 'orders.packed' },
    ]);
  });

  it('unbinds a bound field with the same gesture', () => {
    const result = toggleFieldBinding(layout(), TESTED);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.layout.statusBindings, []);
  });

  it('binds subtitle-kind fields into the subtitle band', () => {
    const result = toggleFieldBinding(layout(), QTY);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.layout.subtitleBindings, [{ fieldId: 'orders.qty' }]);
    assert.deepEqual(result.layout.statusBindings, [{ fieldId: 'orders.picked' }]);
  });

  it('refuses the 11th status binding with the limit copy', () => {
    const full = layout({
      statusBindings: Array.from({ length: MAX_STATUS_SLOTS }, (_, i) => ({
        fieldId: `orders.s${i}`,
      })),
    });
    const result = toggleFieldBinding(full, PACKED);
    assert.deepEqual(result, { ok: false, reason: slotLimitMessage('status') });
  });

  it('refuses identity and amount kinds — locked, not free slots', () => {
    assert.equal(toggleFieldBinding(layout(), IDENTITY).ok, false);
    assert.equal(toggleFieldBinding(layout(), AMOUNT).ok, false);
  });

  it('never mutates the input layout', () => {
    const input = layout();
    toggleFieldBinding(input, PACKED);
    assert.deepEqual(input.statusBindings, [{ fieldId: 'orders.picked' }]);
  });
});

describe('moveFieldBinding', () => {
  it('swaps a bound field with its neighbour, in its own band only', () => {
    const bound = layout({
      subtitleBindings: [{ fieldId: 'orders.qty' }, { fieldId: 'orders.notes' }],
    });
    const result = moveFieldBinding(bound, NOTES, 'up');
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.layout.subtitleBindings, [
      { fieldId: 'orders.notes' },
      { fieldId: 'orders.qty' },
    ]);
    // The other band is untouched — a move never crosses bands.
    assert.deepEqual(result.layout.statusBindings, bound.statusBindings);
  });

  it('is a no-op at the band edge and never mutates the input', () => {
    const bound = layout({
      subtitleBindings: [{ fieldId: 'orders.qty' }, { fieldId: 'orders.notes' }],
    });
    const result = moveFieldBinding(bound, QTY, 'up');
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.layout.subtitleBindings, bound.subtitleBindings);
    assert.deepEqual(bound.subtitleBindings, [
      { fieldId: 'orders.qty' },
      { fieldId: 'orders.notes' },
    ]);
  });

  it('refuses an unbound or unbindable field', () => {
    assert.equal(moveFieldBinding(layout(), QTY, 'down').ok, false);
    assert.equal(moveFieldBinding(layout(), AMOUNT, 'up').ok, false);
  });
});

describe('slotFieldOptions', () => {
  it('lists bound rows first in BINDING order, then unbound in catalog order; locked kinds omitted', () => {
    const bound = layout({
      subtitleBindings: [{ fieldId: 'orders.notes' }, { fieldId: 'orders.qty' }],
    });
    assert.deepEqual(slotFieldOptions(bound, CATALOG), [
      {
        fieldId: 'orders.picked', label: 'Pick', band: 'status', bound: true,
        bindingIndex: 0, canMoveUp: false, canMoveDown: false,
      },
      { fieldId: 'orders.packed', label: 'Packed', band: 'status', bound: false },
      // Binding order (notes before qty), NOT catalog order — the menu's top
      // mirrors the painted subtitle line so the ↑/↓ arrows read literally.
      {
        fieldId: 'orders.notes', label: 'Notes', band: 'subtitle', bound: true,
        bindingIndex: 0, canMoveUp: false, canMoveDown: true,
      },
      {
        fieldId: 'orders.qty', label: 'Qty', band: 'subtitle', bound: true,
        bindingIndex: 1, canMoveUp: true, canMoveDown: false,
      },
    ]);
  });

  it('carries the limit copy on unbound rows of a full band', () => {
    const full = layout({
      statusBindings: Array.from({ length: MAX_STATUS_SLOTS }, (_, i) => ({
        fieldId: `orders.s${i}`,
      })),
    });
    const packed = slotFieldOptions(full, CATALOG).find((o) => o.fieldId === 'orders.packed');
    assert.equal(packed?.disabledReason, slotLimitMessage('status'));
  });
});
