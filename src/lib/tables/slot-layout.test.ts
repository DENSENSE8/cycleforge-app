/**
 * SlotLayout write-gate laws: budgets, catalog membership, band permissions,
 * duplicate bindings — each rejection is a config that would otherwise fail as
 * a silent layout bug (a phantom track, an unbindable identity).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldCatalog } from './field-catalog/types';
import {
  MAX_STATUS_SLOTS,
  MAX_SUBTITLE_SLOTS,
  parseSlotLayout,
  readStoredSlotLayout,
  slotLimitMessage,
  type SlotLayout,
} from './slot-layout';

const CATALOG: FieldCatalog = [
  { id: 'orders.order_id', family: 'orders', label: 'Order', displayType: 'id', slotKinds: ['identity'] },
  { id: 'orders.picked', family: 'orders', label: 'Pick', displayType: 'stage_event', slotKinds: ['status'], iconKey: 'picked' },
  { id: 'orders.packed', family: 'orders', label: 'Packed', displayType: 'stage_event', slotKinds: ['status'], iconKey: 'packed' },
  { id: 'orders.qty', family: 'orders', label: 'Qty', displayType: 'number', slotKinds: ['subtitle'] },
  { id: 'orders.notes', family: 'orders', label: 'Notes', displayType: 'note', slotKinds: ['subtitle'] },
  { id: 'orders.amount', family: 'orders', label: 'Amount', displayType: 'money', slotKinds: ['amount'] },
];

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

describe('parseSlotLayout', () => {
  it('accepts a valid document verbatim', () => {
    const parsed = parseSlotLayout(layout(), CATALOG);
    assert.deepEqual(parsed.statusBindings, [{ fieldId: 'orders.picked' }]);
  });

  it('rejects an unknown field id and names the slot', () => {
    assert.throws(
      () => parseSlotLayout(layout({ statusBindings: [{ fieldId: 'orders.ghost' }] }), CATALOG),
      /status:1: unknown field 'orders.ghost'/,
    );
  });

  it('rejects a status bind of a field whose slotKinds forbids status', () => {
    assert.throws(
      () => parseSlotLayout(layout({ statusBindings: [{ fieldId: 'orders.qty' }] }), CATALOG),
      /status:1: field 'orders.qty' does not allow the 'status' slot/,
    );
  });

  it('rejects a subtitle bind of a status-only field', () => {
    assert.throws(
      () => parseSlotLayout(layout({ subtitleBindings: [{ fieldId: 'orders.picked' }] }), CATALOG),
      /subtitle:1: field 'orders.picked' does not allow the 'subtitle' slot/,
    );
  });

  it('rejects a non-id identity field', () => {
    assert.throws(
      () => parseSlotLayout(layout({ identityFieldId: 'orders.picked' }), CATALOG),
      /identity/,
    );
  });

  it(`rejects an ${MAX_STATUS_SLOTS + 1}th status binding at the schema`, () => {
    const bindings = Array.from({ length: MAX_STATUS_SLOTS + 1 }, (_, i) => ({
      fieldId: `orders.s${i}`,
    }));
    assert.throws(() => parseSlotLayout(layout({ statusBindings: bindings }), CATALOG));
  });

  it(`rejects a ${MAX_SUBTITLE_SLOTS + 1}th subtitle binding at the schema`, () => {
    const bindings = Array.from({ length: MAX_SUBTITLE_SLOTS + 1 }, (_, i) => ({
      fieldId: `orders.t${i}`,
    }));
    assert.throws(() => parseSlotLayout(layout({ subtitleBindings: bindings }), CATALOG));
  });

  it('rejects the same field bound twice', () => {
    assert.throws(
      () =>
        parseSlotLayout(
          layout({ statusBindings: [{ fieldId: 'orders.picked' }, { fieldId: 'orders.picked' }] }),
          CATALOG,
        ),
      /duplicate bindings: orders.picked/,
    );
  });

  it('rejects unknown document keys (strict object)', () => {
    assert.throws(() =>
      parseSlotLayout({ ...layout(), rogue: true } as unknown, CATALOG),
    );
  });
});

describe('readStoredSlotLayout', () => {
  it('reads a structurally valid blob', () => {
    assert.deepEqual(readStoredSlotLayout(layout()), layout());
  });

  it('returns null for absent / legacy / hostile blobs instead of throwing', () => {
    assert.equal(readStoredSlotLayout(null), null);
    assert.equal(readStoredSlotLayout(undefined), null);
    assert.equal(readStoredSlotLayout('tested'), null);
    assert.equal(readStoredSlotLayout({ columns: ['tested'] }), null);
    assert.equal(readStoredSlotLayout({ ...layout(), morph: 'board' }), null);
    assert.equal(readStoredSlotLayout({ ...layout(), statusBindings: ['orders.picked'] }), null);
  });

  it('normalizes: unknown keys are stripped from the read document', () => {
    assert.deepEqual(readStoredSlotLayout({ ...layout(), rogue: true }), layout());
  });

  it("keeps a stale-but-structural blob — catalog staleness is the resolver's job", () => {
    const stale = layout({ statusBindings: [{ fieldId: 'orders.deleted_field' }] });
    assert.deepEqual(readStoredSlotLayout(stale), stale);
  });
});

describe('slotLimitMessage', () => {
  it('names the band and the cap', () => {
    assert.equal(slotLimitMessage('status'), 'Status limit (10) reached — remove one to add another.');
    assert.equal(slotLimitMessage('subtitle'), 'Subtitle limit (5) reached — remove one to add another.');
  });
});
