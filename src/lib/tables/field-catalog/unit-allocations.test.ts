/** Unit-allocations catalog guards + resolver/adapter behaviour — Wave D's port of `ByUnitView.tsx`'s allocations table off hand HTML. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '@/lib/tables/table-definition';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import type { AllocationRow } from '@/components/inventory/types';
import {
  UNIT_ALLOCATIONS_COMPOUND_COLUMNS,
  unitAllocationsCompoundColumnsFor,
  unitAllocationsSortFactFor,
  isUnitAllocationsColumnSortable,
} from '@/components/inventory/allocations-grid/unit-allocations-grid-layout';
import { unitAllocationsCompoundView } from '@/components/inventory/allocations-grid/unit-allocations-row-view';
import { UNIT_ALLOCATIONS_TABLE_DEFINITION } from '@/components/inventory/allocations-grid/unit-allocations-table-definition';
import {
  UNIT_ALLOCATIONS_FIELD_CATALOG,
  UNIT_ALLOCATIONS_PRODUCT_LAYOUT,
  UNIT_ALLOCATIONS_TABLE_LAYOUT_ID,
} from './unit-allocations';
import { ALLOCATION_SYSTEM_ACTOR, resolveUnitAllocationsSlotValue } from './unit-allocations-resolve';
import { UNIT_TSN_LINKS_FIELD_CATALOG } from './unit-tsn-links';


/** The unit-detail wire row — release facts, no `serial_unit_id`. */
function unitFeedRow(overrides: Partial<UnitAllocationTableRow> = {}): UnitAllocationTableRow {
  return {
    id: 4471,
    order_id: 90210,
    allocated_at: '2026-09-02T14:05:00.000Z',
    state: 'ALLOCATED',
    released_at: null,
    released_reason: null,
    allocated_by_name: 'Dana Reyes',
    ...overrides,
  };
}

/**
 * The per-SKU wire row — `serial_unit_id`, no release facts. Typed as the
 * shared row so this file fails to compile the day the two feeds stop being
 * expressible as one family, which is the coordination this port owns.
 */
function skuFeedRow(overrides: Partial<UnitAllocationTableRow> = {}): UnitAllocationTableRow {
  return {
    id: 4471,
    order_id: 90210,
    serial_unit_id: 7781,
    allocated_at: '2026-09-02T14:05:00.000Z',
    state: 'PICKED',
    allocated_by_name: 'Dana Reyes',
    ...overrides,
  };
}

describe('unit-allocations catalog', () => {
  it('has unique ids, all unit-allocations-family, each bindable somewhere', () => {
    const ids = UNIT_ALLOCATIONS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of UNIT_ALLOCATIONS_FIELD_CATALOG) {
      assert.equal(field.family, 'unit-allocations', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('unit-allocations.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares NO field id with unit-tsn-links, its sibling on the same page', () => {
    const other = new Set(UNIT_TSN_LINKS_FIELD_CATALOG.map((f) => f.id));
    for (const field of UNIT_ALLOCATIONS_FIELD_CATALOG) {
      assert.ok(!other.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('every catalog path names a real key on the SHARED wire row', () => {
    // The union of both feeds' keys — which is what the shared row type IS.
    const wire = new Set([...Object.keys(unitFeedRow()), ...Object.keys(skuFeedRow())]);
    for (const field of UNIT_ALLOCATIONS_FIELD_CATALOG) {
      for (const path of Object.values(field.paths ?? {})) {
        assert.ok(wire.has(path), `${field.id} reads '${path}', which neither allocation feed sends`);
      }
    }
  });

  it('names BOTH desks’ facts — one family, not two', () => {
    const ids = UNIT_ALLOCATIONS_FIELD_CATALOG.map((f) => f.id);
    // Only the unit-detail feed carries these…
    assert.ok(ids.includes('unit-allocations.released'));
    assert.ok(ids.includes('unit-allocations.reason'));
    // …and only the per-SKU feed carries these. A catalog missing either half
    // is the fork this port exists to prevent.
    assert.ok(ids.includes('unit-allocations.unit'));
    assert.ok(ids.includes('unit-allocations.allocated_by'));
  });

  it('the ByUnitView wire row satisfies the shared row type', () => {
    // Compile-time assertion with a runtime witness: `AllocationRow` is what
    // `/api/serial-units` sends, and the family must read it with no mapper.
    const wire: AllocationRow = {
      id: 4471,
      order_id: 90210,
      allocated_at: '2026-09-02T14:05:00.000Z',
      state: 'ALLOCATED',
      released_at: null,
      released_reason: null,
      allocated_by_name: null,
    };
    const shared: UnitAllocationTableRow = wire;
    assert.equal(shared.order_id, 90210);
  });

  it('product default parses against the catalog — released on a track, reason under the title', () => {
    const parsed = UNIT_ALLOCATIONS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'unit-allocations.order');
    assert.deepEqual(parsed.statusBindings, [{ fieldId: 'unit-allocations.released' }]);
    assert.deepEqual(parsed.subtitleBindings, [{ fieldId: 'unit-allocations.reason' }]);
  });

  it('the identity fact is the ORDER, and only the two ids may hold the slot', () => {
    const identity = UNIT_ALLOCATIONS_FIELD_CATALOG.filter((f) => f.slotKinds.includes('identity'));
    assert.deepEqual(identity.map((f) => f.id), [
      'unit-allocations.order',
      'unit-allocations.unit',
    ]);
    // The write gate refuses a non-`id` identity; pin that both are `id`.
    for (const field of identity) assert.equal(field.displayType, 'id', field.id);
  });

  it('both stamps stay DATE facts — the relative face is display, not data', () => {
    for (const id of ['unit-allocations.allocated', 'unit-allocations.released']) {
      const field = UNIT_ALLOCATIONS_FIELD_CATALOG.find((f) => f.id === id);
      assert.equal(field?.displayType, 'date', id);
    }
  });

  it('serves the `unit-allocations` tableId', () => {
    assert.equal(UNIT_ALLOCATIONS_TABLE_LAYOUT_ID, 'unit-allocations');
    assert.equal(UNIT_ALLOCATIONS_TABLE_DEFINITION.tableId, 'unit-allocations');
  });
});

describe('the mounted unit-allocations compound model', () => {
  it('mounts the shared skeleton WHOLE — no chrome cut, one status track', () => {
    // Skeleton order is derived from the engine, never hand-listed: a track
    // added to (or removed from) COMPOUND_COLUMN_KEYS must not need an edit here.
    const keys = UNIT_ALLOCATIONS_COMPOUND_COLUMNS.map((c) => c.key);
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:') && !k.startsWith('subtitle:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 2), ['state', 'status:1']);
  });

  it('renames the chrome headers to this desk’s vocabulary', () => {
    const label = (key: string) =>
      UNIT_ALLOCATIONS_COMPOUND_COLUMNS.find((c) => c.key === key)?.gridLabel;
    // The identity header is the ENGINE's `Id` on every peer since
    // 2026-09-15 (`data-table-family.ts`); this desk used to print
    // "Order", which is now the Fields-picker word and the cell's hover word.
    assert.equal(label('fulfillment'), 'Id');
    assert.equal(label('item'), 'Unit');
    assert.equal(label('dates'), 'Allocated');
    assert.equal(label('state'), 'State');
  });

  it('every painted fact is click-to-sort; only chrome is not', () => {
    for (const key of ['fulfillment', 'item', 'state', 'dates', 'status:1']) {
      assert.ok(
        isUnitAllocationsColumnSortable(UNIT_ALLOCATIONS_COMPOUND_COLUMNS, key),
        `${key} paints a fact and must sort`,
      );
    }
    for (const key of ['select', 'thumb', '_fill']) {
      assert.ok(
        !isUnitAllocationsColumnSortable(UNIT_ALLOCATIONS_COMPOUND_COLUMNS, key),
        `${key} is chrome and must not sort`,
      );
    }
    assert.equal(unitAllocationsSortFactFor({ key: 'state' }), 'unit-allocations.state');
    assert.equal(unitAllocationsSortFactFor({ key: 'dates' }), 'unit-allocations.allocated');
  });

  it('leaves room for the per-SKU mount to bind unit + allocated_by', () => {
    const columns = unitAllocationsCompoundColumnsFor({
      ...UNIT_ALLOCATIONS_PRODUCT_LAYOUT,
      statusBindings: [
        { fieldId: 'unit-allocations.unit' },
        { fieldId: 'unit-allocations.allocated_by' },
        { fieldId: 'unit-allocations.released' },
      ],
    });
    const unit = columns.find((c) => c.fieldId === 'unit-allocations.unit');
    assert.equal(unit?.key, 'status:1');
    assert.equal(unit?.slotDisplayType, 'id');
    // Still inside the dense ceiling, so `parseTableDefinition` would accept it.
    const defaultVisible = columns.filter((c) => c.key !== 'select');
    assert.ok(
      defaultVisible.length <= MAX_DEFAULT_VISIBLE_TRACKS,
      `${defaultVisible.length} default-visible tracks exceeds ${MAX_DEFAULT_VISIBLE_TRACKS}`,
    );
  });
});

describe('resolveUnitAllocationsSlotValue', () => {
  it('resolves each catalog field off the unit-detail wire row', () => {
    const r = unitFeedRow({ released_at: '2026-09-04T09:00:00.000Z', released_reason: 'CANCELLED' });
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.order'), {
      kind: 'value',
      text: '90210',
    });
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.state'), {
      kind: 'value',
      text: 'ALLOCATED',
    });
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.allocated'), {
      kind: 'value',
      text: '2026-09-02T14:05:00.000Z',
    });
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.released'), {
      kind: 'value',
      text: '2026-09-04T09:00:00.000Z',
    });
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.reason'), {
      kind: 'value',
      text: 'CANCELLED',
    });
  });

  it('the order resolves BARE — the `#` is the id face, not the fact', () => {
    // Baking the sigil in would sort `#9` after `#10` as text and make a
    // search typed without it miss.
    const value = resolveUnitAllocationsSlotValue(unitFeedRow(), 'unit-allocations.order');
    assert.equal(value?.kind === 'value' ? value.text : null, '90210');
  });

  it('a live hold says nothing about release — the dash is the cell’s face', () => {
    const r = unitFeedRow();
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.released'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.reason'), {
      kind: 'value',
      text: null,
    });
  });

  it('reads the per-SKU feed too — the unit resolves, the release facts blank', () => {
    const r = skuFeedRow();
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.unit'), {
      kind: 'value',
      text: '7781',
    });
    assert.deepEqual(resolveUnitAllocationsSlotValue(r, 'unit-allocations.released'), {
      kind: 'value',
      text: null,
    });
  });

  it('an unattributed allocation was made by the system, not by nobody', () => {
    assert.deepEqual(
      resolveUnitAllocationsSlotValue(unitFeedRow({ allocated_by_name: null }), 'unit-allocations.allocated_by'),
      { kind: 'value', text: ALLOCATION_SYSTEM_ACTOR },
    );
  });

  it('an unknown field id resolves to nothing — bindings never cross families', () => {
    assert.equal(resolveUnitAllocationsSlotValue(unitFeedRow(), 'unit-tsn-links.station'), null);
    assert.equal(resolveUnitAllocationsSlotValue(unitFeedRow(), 'unit-allocations.nope'), null);
  });
});

describe('unitAllocationsCompoundView', () => {
  it('puts the order on identity and the unit on the title', () => {
    const view = unitAllocationsCompoundView(skuFeedRow());
    assert.equal(view.id, '4471');
    assert.equal(view.orderId, '90210');
    assert.equal(view.title, 'Unit #7781');
  });

  it('names the row by its own id when the feed omits the unit', () => {
    assert.equal(unitAllocationsCompoundView(unitFeedRow()).title, 'Allocation #4471');
  });

  it('tones the allocation state, never recoloured by fact', () => {
    assert.equal(unitAllocationsCompoundView(unitFeedRow()).stateTone, 'neutral');
    assert.equal(unitAllocationsCompoundView(unitFeedRow({ state: 'SHIPPED' })).stateTone, 'done');
    assert.equal(unitAllocationsCompoundView(unitFeedRow({ state: 'RELEASED' })).stateTone, 'done');
    // A state nobody mapped stays ordinary, never urgent.
    const odd = unitAllocationsCompoundView(unitFeedRow({ state: 'WEIRD' }));
    assert.equal(odd.stateTone, 'neutral');
  });

  it('uses the Hash line for the allocation stamp, with the family’s own hover', () => {
    const view = unitAllocationsCompoundView(unitFeedRow());
    assert.equal(view.orderedAt?.dateKey, '2026-09-02');
    assert.ok(view.orderedAt?.label, 'Hash line must carry the civil face');
    assert.equal(view.startedHover, view.orderedAt?.tip);
  });

  it('a live hold invents no countdown; a released one uses the Calendar line', () => {
    assert.equal(unitAllocationsCompoundView(unitFeedRow()).delay, null);
    const released = unitAllocationsCompoundView(
      unitFeedRow({ state: 'RELEASED', released_at: '2026-09-04T09:00:00.000Z' }),
    );
    assert.ok(released.delay?.faceLabel, 'Calendar line must carry the release face, never `--`');
    assert.equal(released.delay?.overdue, false, 'a released hold is over, not late');
    assert.ok(released.stateTip?.startsWith('Released'));
  });

  it('never paints a photo, a tracking brand or an amount — a hold has none', () => {
    const view = unitAllocationsCompoundView(unitFeedRow());
    assert.equal(view.thumbUrl, null);
    assert.equal(view.tracking, null);
    assert.equal(view.carrier, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
  });
});
