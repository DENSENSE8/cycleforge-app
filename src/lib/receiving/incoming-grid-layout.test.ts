import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INCOMING_COMPOUND_COLUMNS,
  INCOMING_GRID_SORTABLE_KEYS,
  defaultDirForIncomingGridSort,
  incomingContentMinWidthRem,
  incomingGridColumnTrackRem,
  incomingGridHeaderShowsLabel,
  incomingGridTemplate,
  isIncomingGridFrozen,
  isIncomingGridSortable,
} from '@/lib/receiving/receiving-grid-layout';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

describe('Incoming compound column model', () => {
  it('uses the canonical shared tracks in order', () => {
    assert.deepEqual(
      INCOMING_COMPOUND_COLUMNS.map((column) => column.key),
      ['select', 'fulfillment', 'thumb', 'item', 'dates', 'state', '_fill'],
    );
  });

  it('freezes only the shared identity gutters', () => {
    assert.equal(isIncomingGridFrozen('select'), true);
    assert.equal(isIncomingGridFrozen('fulfillment'), true);
    assert.equal(isIncomingGridFrozen('thumb'), true);
    assert.equal(isIncomingGridFrozen('item'), false);
    assert.equal(isIncomingGridFrozen('_fill'), false);
  });

  it('keeps one trailing flex track and exposes the shared header grammar', () => {
    const template = incomingGridTemplate();
    assert.equal((template.match(/1fr/g) ?? []).length, 1);
    const item = INCOMING_COMPOUND_COLUMNS.find((column) => column.key === 'item')!;
    assert.equal(incomingGridHeaderShowsLabel(item), true);
    assert.equal(item.resizable, true);
  });

  it('sorts only data tracks and preserves the durable comparator', () => {
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('item'));
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('state'));
    assert.equal(INCOMING_GRID_SORTABLE_KEYS.includes('thumb'), false);
    assert.equal(isIncomingGridSortable('select'), false);
    assert.equal(isIncomingGridSortable('_fill'), false);
    assert.equal(defaultDirForIncomingGridSort('age'), 'desc');
    assert.equal(defaultDirForIncomingGridSort('item'), 'asc');
  });

  it('calculates width from the same mounted model used by the grid', () => {
    const expected = INCOMING_COMPOUND_COLUMNS.reduce(
      (sum, column) => sum + incomingGridColumnTrackRem(column),
      0,
    );
    assert.equal(incomingContentMinWidthRem(), expected);
  });
});

describe('Incoming compound row sorting', () => {
  it('sorts product titles through the existing comparator', () => {
    const a = { id: 1, item_name: 'Alpha' } as ReceivingLineRow;
    const b = { id: 2, item_name: 'Bravo' } as ReceivingLineRow;
    assert.ok(compareIncomingGridRows(a, b, 'title', 'asc') < 0);
    assert.ok(compareIncomingGridRows(a, b, 'title', 'desc') > 0);
  });

  it('sorts delivery state by rank and confidence', () => {
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
    assert.ok(compareIncomingGridRows(arriving, stalled, 'status', 'asc') < 0);
  });
});