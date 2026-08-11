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
import { TABLE_COLUMNS } from '@/lib/tables/table-columns';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

describe('INCOMING_GRID_COLUMNS — matches Pending SoT scan order', () => {
  it('is select · order · title · date · age · qty · condition · status · platform · tracking · zoho', () => {
    assert.deepEqual(
      INCOMING_GRID_COLUMNS.map((c) => c.key),
      ['select', 'order', 'title', 'date', 'age', 'qty', 'condition', 'status', 'platform', 'tracking', 'zoho'],
    );
  });

  it('labels Product Title on the title track', () => {
    const title = INCOMING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    assert.equal(title.label, 'Product Title');
    assert.equal(title.gridLabel, undefined);
    // Notion overflow pilot — fixed preferred track, not the fill `1fr` other
    // families still use. Content-sized columns can exceed the card and scroll.
    assert.equal(title.width, 'minmax(16rem, 16rem)');
    assert.equal(title.width.includes('1fr'), false);
  });

  it('labels Status on its own track (hideKey rest)', () => {
    const status = INCOMING_GRID_COLUMNS.find((c) => c.key === 'status')!;
    assert.equal(status.label, 'Status');
    assert.equal(status.hideKey, 'rest');
    assert.equal(status.type, 'tag');
  });

  // Unbox Sheets golden (2026-08-04): only `select` is frozen — order/title
  // scroll with the sheet (same as Receiving).
  it('locks select only as the frozen identity pane (Sheets-class)', () => {
    assert.deepEqual([...INCOMING_GRID_LOCKED_KEYS], ['select']);
    assert.ok(isIncomingGridFrozen('select'));
    assert.equal(isIncomingGridFrozen('order'), false);
    assert.equal(isIncomingGridFrozen('title'), false);
    assert.equal(isIncomingGridFrozen('qty'), false);
  });

  it('the order track scrolls — always-on, never a tier, start-aligned', () => {
    const order = INCOMING_GRID_COLUMNS.find((c) => c.key === 'order')!;
    assert.equal(order.frozen, undefined);
    assert.equal(order.hideKey, undefined, 'order stays always-on (no pref key)');
    assert.equal(order.tier, undefined);
    // A transaction identity reads left, like a name — not end-aligned like the
    // reference identifiers (`tracking`).
    assert.equal(order.align, 'start');
  });

  // Inbound ↔ History one family (2026-08-10): the icon-only exception is
  // OVERTURNED. Incoming follows History sentence-case — no data column declares
  // headerGlyphOnly, and geometry (`gridHeaderShowsLabel`) owns the narrow-track
  // glyph fallback, the same rule History already lives by.
  it('no data column declares headerGlyphOnly (History sentence-case parity)', () => {
    for (const col of INCOMING_GRID_COLUMNS) {
      if (col.key === 'select') continue; // chrome gutter — no label, no header
      assert.equal(
        col.headerGlyphOnly,
        undefined,
        `${col.key} must NOT declare headerGlyphOnly — Incoming follows History sentence-case`,
      );
      assert.ok(col.label, `${col.key} keeps a label`);
    }
  });

  it('the wide identity/reference headers show their sentence-case word', () => {
    for (const key of ['order', 'title', 'tracking']) {
      const col = INCOMING_GRID_COLUMNS.find((c) => c.key === key)!;
      assert.equal(
        incomingGridHeaderShowsLabel(col),
        true,
        `${key} header should read its word like History`,
      );
    }
  });

  it('the qty header keeps its Qty word via labelFitRem 3.5 (History parity)', () => {
    const qty = INCOMING_GRID_COLUMNS.find((c) => c.key === 'qty')!;
    assert.equal(qty.headerGlyphOnly, undefined);
    assert.equal(qty.labelFitRem, 3.5);
    assert.equal(qty.label, 'Qty');
  });

  it('does NOT flex title — Notion overflow pilot (fixed preferred track)', () => {
    const template = incomingGridTemplate();
    assert.equal(
      (template.match(/1fr/g) ?? []).length,
      0,
      'Incoming opts out of the fill track so columns can exceed the card',
    );
    // Fixed preferred width; drag-resize still overrides via `--cf-col-title`.
    // Rem floors density-scale for spreadsheet zoom (`--cf-density`).
    assert.match(
      template,
      /var\(--cf-col-title, calc\(16rem \* var\(--cf-density, 1\)\)\)/,
      'title is a fixed 16rem preferred track, not minmax(…, 1fr)',
    );
  });

  it('ships a lean default — condition + platform are opt-in', () => {
    const tierOf = (key: string) =>
      INCOMING_GRID_COLUMNS.find((c) => c.key === key)?.tier ?? 'core';
    // Pre-arrival rows have no condition grade and the channel is secondary to
    // the PO/tracking identity — both cost horizontal budget for a blank cell.
    assert.equal(tierOf('condition'), 'optional');
    assert.equal(tierOf('platform'), 'optional');
    // The scan spine stays on by default. `order` is absent here on purpose —
    // it is always-on (no hideKey / no tier), like Receiving's order track.
    for (const key of ['date', 'age', 'qty', 'status', 'tracking']) {
      assert.equal(tierOf(key), 'core', `${key} must ship visible`);
    }
  });

  it('owns a distinct incoming TableId (not shared with receiving)', () => {
    // Split 2026-07-30 — Incoming and Unbox/History no longer share prefs.
    // Tiers may diverge; the old key-for-key lockstep is retired.
    assert.ok(TABLE_COLUMNS.incoming);
    assert.ok(TABLE_COLUMNS.receiving);
    assert.notEqual(
      TABLE_COLUMNS.incoming,
      TABLE_COLUMNS.receiving,
      'incoming and receiving must be separate registry entries',
    );
    // Incoming has no serial track in its Fields vocabulary.
    assert.equal(
      TABLE_COLUMNS.incoming.some((c) => c.key === 'serial'),
      false,
    );
    assert.equal(
      TABLE_COLUMNS.receiving.some((c) => c.key === 'serial'),
      true,
    );
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

  it('title header shows Product Title (sentence-case parity)', () => {
    const title = INCOMING_GRID_COLUMNS.find((c) => c.key === 'title')!;
    assert.equal(title.headerGlyphOnly, undefined);
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
