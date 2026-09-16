/**
 * The flat `INCOMING_GRID_COLUMNS` spreadsheet array is DELETED — `/incoming`
 * mounts `INCOMING_COMPOUND_COLUMNS` like every other desk. The geometry and
 * per-track label assertions that pinned that hand array went with it; what a
 * consumer can still observe is pinned here: the sort vocabulary, the frozen
 * pane of the mounted model, the two catalogs' separation, and the comparator.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INCOMING_COMPOUND_COLUMNS,
  INCOMING_GRID_LOCKED_KEYS,
  INCOMING_GRID_SORTABLE_KEYS,
  defaultDirForIncomingGridSort,
  flipIncomingGridSortDir,
  isIncomingGridFrozen,
  isIncomingGridSortable,
} from '@/lib/receiving/receiving-grid-layout';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import { TABLE_COLUMNS } from '@/lib/tables/table-columns';
import { INCOMING_FIELD_CATALOG } from '@/lib/tables/field-catalog/incoming';
import { RECEIVING_FIELD_CATALOG } from '@/lib/tables/field-catalog/receiving';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

describe('incoming mounted column model', () => {
  it('freezes exactly the compound model’s frozen prefix', () => {
    const frozen = INCOMING_COMPOUND_COLUMNS.filter((c) => c.frozen).map((c) => c.key);
    assert.deepEqual([...INCOMING_GRID_LOCKED_KEYS], frozen);
    for (const col of INCOMING_COMPOUND_COLUMNS) {
      assert.equal(
        isIncomingGridFrozen(col.key),
        Boolean(col.frozen),
        `${col.key} freeze disagrees with the mounted column model`,
      );
    }
  });

  it('never marks a column optional without a hideKey', () => {
    // An `optional` track with no pref key can never be turned back on.
    for (const col of INCOMING_COMPOUND_COLUMNS) {
      if (col.tier === 'optional') assert.ok(col.hideKey, `${col.key} needs a hideKey`);
    }
  });

  it('owns a distinct incoming TableId (not shared with receiving)', () => {
    // Split 2026-07-30 — Incoming and Unbox/History no longer share prefs.
    // Both `TABLE_COLUMNS` buckets are `[]` since the slot port (hiding a fact
    // is unbinding it from a slot), so the difference lives in the two field
    // catalogs — which is where a porter would look for it.
    assert.ok(TABLE_COLUMNS.incoming, 'incoming must stay a TableId');
    assert.ok(TABLE_COLUMNS.receiving, 'receiving must stay a TableId');
    assert.notEqual(
      TABLE_COLUMNS.incoming,
      TABLE_COLUMNS.receiving,
      'incoming and receiving must be separate registry entries',
    );

    const incomingIds = INCOMING_FIELD_CATALOG.map((f) => f.id);
    const receivingIds = RECEIVING_FIELD_CATALOG.map((f) => f.id);

    // A serial is read during unbox, which is a RECEIVING act — an inbound POS
    // line has not been opened yet, so it has no serial to bind.
    assert.equal(
      receivingIds.includes('receiving.serial'),
      true,
      'receiving must carry a bindable serial fact',
    );
    assert.equal(
      incomingIds.some((id) => id.endsWith('.serial')),
      false,
      'incoming must not carry a serial fact',
    );

    // The two catalogs share no field id at all: one row, two questions
    // (`delivery_state` vs `workflow_status`), and a shared id would let a
    // rebind on one desk move a track on the other.
    const shared = incomingIds.filter((id) => receivingIds.includes(id));
    assert.deepEqual(shared, [], 'the two catalogs must share no field id');
  });
});

describe('isIncomingGridSortable — the one sortability answer', () => {
  it('keeps the fact words sortable and the chrome tracks not', () => {
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('title'));
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('status'));
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('tracking'));
    assert.equal(isIncomingGridSortable('select'), false);
    assert.equal(isIncomingGridSortable('age'), true);
  });

  it('resolves every painted DATA track to a fact it can order by', () => {
    for (const col of INCOMING_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key)) continue;
      if (col.key === '_fill') continue;
      assert.equal(
        isIncomingGridSortable(col.key),
        true,
        `${col.key} is painted as a data track but resolves to no sort fact`,
      );
    }
  });
});

describe('incoming grid column sort', () => {
  it('flips dir and defaults age to desc', () => {
    assert.equal(defaultDirForIncomingGridSort('title'), 'asc');
    assert.equal(defaultDirForIncomingGridSort('age'), 'desc');
    assert.equal(flipIncomingGridSortDir('asc'), 'desc');
  });

  it('compareIncomingGridRows sorts titles A→Z', () => {
    const a = { id: 1, item_name: 'Alpha' } as ReceivingLineRow;
    const b = { id: 2, item_name: 'Bravo' } as ReceivingLineRow;
    assert.ok(compareIncomingGridRows(a, b, 'title', 'asc') < 0);
    assert.ok(compareIncomingGridRows(a, b, 'title', 'desc') > 0);
  });

  it('compareIncomingGridRows sorts status by delivery_state then confidence', () => {
    const stalled = {
      id: 1,
      delivery_state: 'STALLED',
      tracking_confidence: 'carrier_confirmed',
    } as ReceivingLineRow;
    const arriving = {
      id: 2,
      delivery_state: 'ARRIVING_TODAY',
      tracking_confidence: 'seller_reported',
    } as ReceivingLineRow;
    // ARRIVING_TODAY precedes STALLED in DELIVERY_STATE_ORDER.
    assert.ok(compareIncomingGridRows(arriving, stalled, 'status', 'asc') < 0);

    const seller = {
      id: 3,
      delivery_state: 'IN_TRANSIT',
      tracking_confidence: 'seller_reported',
    } as ReceivingLineRow;
    const carrier = {
      id: 4,
      delivery_state: 'IN_TRANSIT',
      tracking_confidence: 'carrier_confirmed',
    } as ReceivingLineRow;
    assert.ok(compareIncomingGridRows(seller, carrier, 'status', 'asc') < 0);
  });
});
