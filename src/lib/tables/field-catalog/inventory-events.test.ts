/** Inventory-events catalog guards + resolver behaviour — the family that replaced the Ledger's hand-rolled `EventRow` card list. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INVENTORY_EVENTS_COMPOUND_COLUMNS,
  inventoryEventsCompoundColumnsFor,
  inventoryEventsSortFactFor,
} from '@/components/inventory/events-grid/inventory-events-grid-layout';
import type { PulseEventRow } from '@/components/inventory/types';
import {
  INVENTORY_EVENTS_FIELD_CATALOG,
  INVENTORY_EVENTS_PRODUCT_LAYOUT,
} from './inventory-events';
import { resolveInventoryEventsSlotValue } from './inventory-events-resolve';


function row(overrides: Partial<PulseEventRow> = {}): PulseEventRow {
  return {
    id: 91,
    occurred_at: '2026-09-04T10:21:30.000Z',
    event_type: 'note',
    actor_staff_id: 1,
    actor_name: 'David',
    station: 'unbox',
    sku: '00106-BK',
    product_title: 'Bose CineMate remote',
    serial_unit_id: 31846,
    serial_number: 'SN-77',
    bin_id: 4,
    bin_name: 'A-12',
    prev_bin_id: null,
    prev_bin_name: null,
    prev_status: 'Matched',
    next_status: 'Received',
    notes: null,
    payload: {},
    receiving_id: null,
    receiving_line_id: null,
    ...overrides,
  };
}

describe('inventory-events catalog', () => {
  it('has unique ids, all inventory-events family, each bindable somewhere', () => {
    const ids = INVENTORY_EVENTS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of INVENTORY_EVENTS_FIELD_CATALOG) {
      assert.equal(field.family, 'inventory-events', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(
        field.id.startsWith('inventory-events.'),
        `${field.id} is not family-qualified`,
      );
    }
  });

  it('product default parses against the catalog (compound morph; the full set bound)', () => {
    const parsed = INVENTORY_EVENTS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'inventory-events.sku');
    assert.equal(parsed.statusBindings.length, 5);
  });
});

describe('inventory-events materialization', () => {
  it('mounts the SHARED compound skeleton plus one slot per binding', () => {
    const keys = INVENTORY_EVENTS_COMPOUND_COLUMNS.map((c) => c.key);
    // The identity slot IS the shared `fulfillment` track on a compound row —
    // renaming it would fork this family away from every other compound peer.
    assert.ok(keys.includes('fulfillment'));
    assert.ok(keys.includes('item'));
    assert.ok(keys.includes('thumb'));
    // No money on an inventory event, and no bulk verbs on a read map.
    assert.ok(!keys.includes('amount'));
    assert.ok(!keys.includes('select'));
    assert.equal(
      keys.filter((k) => String(k).startsWith('status:')).length,
      INVENTORY_EVENTS_PRODUCT_LAYOUT.statusBindings.length,
    );
    // Every fact the retired card painted that the shared CHROME does not already carry is bound as a track.
    const bound = INVENTORY_EVENTS_COMPOUND_COLUMNS.map((c) => c.fieldId).filter(Boolean);
    for (const id of [
      'inventory-events.occurred',
      'inventory-events.event_type',
      'inventory-events.serial',
      'inventory-events.bin',
      'inventory-events.actor',
    ]) {
      assert.ok(bound.includes(id), `${id} lost in the port`);
    }
    // …and they are still BINDABLE — an org can put them back.
    for (const id of [
      'inventory-events.status_change',
      'inventory-events.station',
      'inventory-events.notes',
    ]) {
      assert.ok(
        INVENTORY_EVENTS_FIELD_CATALOG.some((f) => f.id === id),
        `${id} must stay bindable`,
      );
    }
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = inventoryEventsCompoundColumnsFor({
      ...INVENTORY_EVENTS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'inventory-events.actor' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'inventory-events.actor');
  });

  it('transitions never sort, wherever they are bound', () => {
    const byField = new Map(
      INVENTORY_EVENTS_COMPOUND_COLUMNS.map((c) => [c.fieldId, inventoryEventsSortFactFor(c)]),
    );
    assert.equal(
      inventoryEventsSortFactFor({ key: 'status:9', fieldId: 'inventory-events.status_change' }),
      null,
    );
    assert.equal(byField.get('inventory-events.bin'), null);
    // Everything else offers its own fact.
    assert.equal(byField.get('inventory-events.actor'), 'inventory-events.actor');
    // The identity slot rides the shared fulfillment track and sorts by the
    // identity FACT, not by a track key.
    assert.equal(
      inventoryEventsSortFactFor(
        INVENTORY_EVENTS_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment')!,
      ),
      'inventory-events.sku',
    );
  });
});

describe('inventory-events resolver', () => {
  it('reads a status transition as `prev → next`, and one end alone otherwise', () => {
    const both = resolveInventoryEventsSlotValue(row(), 'inventory-events.status_change');
    assert.deepEqual(both, { kind: 'value', text: 'Matched → Received' });
    const one = resolveInventoryEventsSlotValue(
      row({ prev_status: null }),
      'inventory-events.status_change',
    );
    assert.deepEqual(one, { kind: 'value', text: 'Received' });
  });

  it('reads a bin move as a transition and a put-away as the destination', () => {
    assert.deepEqual(
      resolveInventoryEventsSlotValue(row({ prev_bin_name: 'B-01' }), 'inventory-events.bin'),
      { kind: 'value', text: 'B-01 → A-12' },
    );
    assert.deepEqual(resolveInventoryEventsSlotValue(row(), 'inventory-events.bin'), {
      kind: 'value',
      text: 'A-12',
    });
  });

  it('normalizes the legacy supplemental-serial note', () => {
    const value = resolveInventoryEventsSlotValue(
      row({ notes: 'Supplemental serial SN-99 (beyond expected qty)' }),
      'inventory-events.notes',
    );
    assert.deepEqual(value, { kind: 'value', text: 'Serial SN-99' });
  });

  it('resolves the SKU with its catalog title, and the raw instant for `occurred`', () => {
    assert.deepEqual(resolveInventoryEventsSlotValue(row(), 'inventory-events.sku'), {
      kind: 'value',
      text: '00106-BK · Bose CineMate remote',
    });
    // Never the clock: the same row must resolve the same text at any time.
    assert.deepEqual(resolveInventoryEventsSlotValue(row(), 'inventory-events.occurred'), {
      kind: 'value',
      text: '2026-09-04T10:21:30.000Z',
    });
  });

  it('unknown field ids resolve null (the cell dashes)', () => {
    assert.equal(resolveInventoryEventsSlotValue(row(), 'inventory-events.nope'), null);
  });
});
