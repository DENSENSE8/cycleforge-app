import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INCOMING_GRID_COLUMNS,
  INCOMING_GRID_LOCKED_KEYS,
  INCOMING_GRID_SORTABLE_KEYS,
  defaultDirForIncomingGridSort,
  flipIncomingGridSortDir,
  incomingContentMinWidthRem,
  incomingGridColumnTrackRem,
  incomingGridHeaderShowsLabel,
  incomingGridTemplate,
  isIncomingGridFrozen,
  isIncomingGridSortable,
} from '@/lib/receiving/incoming-grid-layout';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

describe('INCOMING_GRID_COLUMNS — matches Pending SoT scan order', () => {
  it('is select · title · date · age · qty · condition · status · platform · order · tracking', () => {
    assert.deepEqual(
      INCOMING_GRID_COLUMNS.map((c) => c.key),
      ['select', 'title', 'date', 'age', 'qty', 'condition', 'status', 'platform', 'order', 'tracking'],
    );
  });

  it('labels Product Title on the frozen title track', () => {
    const title = INCOMING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    assert.equal(title.label, 'Product Title');
    assert.equal(title.gridLabel, 'Product');
  });

  it('labels Status on its own track (hideKey rest)', () => {
    const status = INCOMING_GRID_COLUMNS.find((c) => c.key === 'status')!;
    assert.equal(status.label, 'Status');
    assert.equal(status.hideKey, 'rest');
    assert.equal(status.type, 'tag');
  });

  it('locks select · title as the frozen identity pane', () => {
    assert.deepEqual([...INCOMING_GRID_LOCKED_KEYS], ['select', 'title']);
    assert.ok(isIncomingGridFrozen('select'));
    assert.ok(isIncomingGridFrozen('title'));
    assert.equal(isIncomingGridFrozen('qty'), false);
  });

  it('flexes ONLY title (purposeful-cell doctrine)', () => {
    const template = incomingGridTemplate();
    assert.equal((template.match(/1fr/g) ?? []).length, 1, 'only title flexes');
    assert.ok(template.includes('minmax(12rem, 1fr)'), 'title is minmax(12rem, 1fr)');
  });

  it('ships a lean default — condition + platform are opt-in', () => {
    const tierOf = (key: string) =>
      INCOMING_GRID_COLUMNS.find((c) => c.key === key)?.tier ?? 'core';
    // Pre-arrival rows have no condition grade and the channel is secondary to
    // the PO/tracking identity — both cost horizontal budget for a blank cell.
    assert.equal(tierOf('condition'), 'optional');
    assert.equal(tierOf('platform'), 'optional');
    // The scan spine stays on by default.
    for (const key of ['date', 'age', 'qty', 'status', 'order', 'tracking']) {
      assert.equal(tierOf(key), 'core', `${key} must ship visible`);
    }
  });

  it('keeps tier in lockstep with RECEIVING_GRID_COLUMNS on shared hideKeys', () => {
    // Incoming mounts under `TableColumnConfigProvider tableId="receiving"`, so
    // `qty`/`condition`/`rest`/`platform`/`orderid`/`tracking` are the SAME
    // stored pref keys Unbox / History use. Tier is what the delta is read
    // against — one key with two tiers means one stored value with two meanings.
    const receivingTier = new Map(
      RECEIVING_GRID_COLUMNS.filter((c) => c.hideKey).map((c) => [c.hideKey!, c.tier ?? 'core']),
    );
    for (const col of INCOMING_GRID_COLUMNS) {
      if (!col.hideKey) continue;
      const sibling = receivingTier.get(col.hideKey);
      if (sibling === undefined) continue; // Incoming-only key.
      assert.equal(
        col.tier ?? 'core',
        sibling,
        `hideKey '${col.hideKey}' must carry the same tier on both receiving-family grids`,
      );
    }
  });

  it('never marks a column optional without a hideKey', () => {
    // An `optional` track with no pref key can never be turned back on.
    for (const col of INCOMING_GRID_COLUMNS) {
      if (col.tier === 'optional') assert.ok(col.hideKey, `${col.key} needs a hideKey`);
    }
  });

  it('marks every data column sortable', () => {
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('title'));
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('status'));
    assert.ok(INCOMING_GRID_SORTABLE_KEYS.includes('tracking'));
    assert.equal(isIncomingGridSortable('select'), false);
    assert.equal(isIncomingGridSortable('age'), true);
  });
});

describe('incomingContentMinWidthRem / header label fit', () => {
  it('sums rem floors across all columns', () => {
    const sum = INCOMING_GRID_COLUMNS.reduce((s, c) => s + incomingGridColumnTrackRem(c), 0);
    assert.equal(incomingContentMinWidthRem(), sum);
    assert.ok(sum > 40, 'content min is wide enough to force h-scroll on narrow panes');
  });

  it('shows Product short label when the title track fits', () => {
    const title = INCOMING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    assert.equal(incomingGridHeaderShowsLabel(title), true);
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
