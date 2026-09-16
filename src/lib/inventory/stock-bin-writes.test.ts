/**
 * The Stock action strip's verb precondition — the mixed-selection failure
 * mode, pinned before the UI exists.
 *
 * The desk lists two pairings and only `bin_contents` rows are writable through
 * the bin endpoints, so the interesting cases here are all about what happens
 * to the OTHER half of a selection: a plan that silently dropped unit rows
 * would move "whichever 3" serials, and a plan that refused the whole press
 * because one row was a unit would make the strip useless on a real floor
 * (69 unit placements against 4 bin pairs when the desk shipped).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planStockBinWrites,
  STOCK_BIN_WRITE_REFUSAL,
} from './stock-bin-writes';
import type { LocationStockTableRow } from './location-stock-row';

function row(over: Partial<LocationStockTableRow> = {}): LocationStockTableRow {
  return {
    location_id: 12,
    location_name: 'A-01-01',
    location_barcode: 'BIN-A-01-01',
    room: 'Annex',
    row_label: '01',
    col_label: '01',
    sku: 'SKU-1',
    product_title: 'Widget',
    image_url: null,
    source: 'bin',
    qty: 7,
    min_qty: null,
    max_qty: null,
    last_counted: null,
    ...over,
  };
}

describe('planStockBinWrites', () => {
  it('passes bin rows through with the barcode and on-hand the endpoints need', () => {
    const plan = planStockBinWrites([
      row(),
      row({ location_id: 13, location_barcode: 'BIN-B-02', sku: 'SKU-2', qty: 3 }),
    ]);

    assert.equal(plan.note, null);
    assert.equal(plan.skipped.length, 0);
    assert.deepEqual(
      plan.targets.map((t) => [t.barcode, t.sku, t.qty]),
      [
        ['BIN-A-01-01', 'SKU-1', 7],
        ['BIN-B-02', 'SKU-2', 3],
      ],
    );
  });

  it('splits a mixed selection instead of hiding the verb or silently writing units', () => {
    const plan = planStockBinWrites([
      row({ sku: 'LOOSE-1' }),
      row({ source: 'unit', sku: 'SERIAL-1', qty: 2 }),
      row({ source: 'unit', sku: 'SERIAL-2', qty: 1 }),
    ]);

    assert.deepEqual(
      plan.targets.map((t) => t.sku),
      ['LOOSE-1'],
    );
    assert.deepEqual(
      plan.skipped.map((s) => [s.face, s.refusal]),
      [
        ['BIN-A-01-01 · SERIAL-1', 'unit-source'],
        ['BIN-A-01-01 · SERIAL-2', 'unit-source'],
      ],
    );
    // The remainder is NAMED, with its count and in the right number, so the
    // operator reads what the press will not touch before pressing it.
    assert.equal(
      plan.note,
      `2 of 3 rows skipped: 2 ${STOCK_BIN_WRITE_REFUSAL['unit-source'].many}`,
    );
  });

  it('says the remainder in the singular when exactly one row is skipped', () => {
    const plan = planStockBinWrites([row({ sku: 'LOOSE-1' }), row({ source: 'unit' })]);

    assert.equal(
      plan.note,
      `1 of 2 rows skipped: ${STOCK_BIN_WRITE_REFUSAL['unit-source'].one}`,
    );
    // "1 serialized units" is the sentence this pairing exists to prevent.
    assert.doesNotMatch(plan.note ?? '', /1 serialized units/);
  });

  it('refuses a selection of nothing but units, and the reason says why', () => {
    const plan = planStockBinWrites([
      row({ source: 'unit', qty: 4 }),
      row({ source: 'unit', sku: 'SKU-9', qty: 1 }),
    ]);

    assert.deepEqual(plan.targets, []);
    // The head carries the total, so the phrase must not repeat it —
    // "all 2 rows are 2 serialized units" says the number twice.
    assert.equal(
      plan.note,
      `Nothing to write here: all 2 rows are ${STOCK_BIN_WRITE_REFUSAL['unit-source'].many}`,
    );
  });

  it('keeps an unresolved placement away from every bin endpoint', () => {
    // `serial_units.current_location` is free text; `85` and `QA-BIN-1` name no
    // `locations` row, so there is no address to write to even though the row
    // has a face and a qty.
    const plan = planStockBinWrites([
      row({ source: 'bin', location_id: null, location_name: '85', location_barcode: null }),
    ]);

    assert.deepEqual(plan.targets, []);
    assert.deepEqual(
      plan.skipped.map((s) => s.refusal),
      ['unresolved-location'],
    );
    assert.match(plan.note ?? '', /^Nothing to write here: this row is /);
    assert.match(plan.note ?? '', /re-place it first/);
  });

  it('refuses a registered location that carries no barcode', () => {
    // Unboxing Area is the live example: a real `locations` row, a staging
    // floor rather than a stock bin, and no scannable handle. Every bin write
    // is keyed by barcode, so offering the verb here would fail on commit.
    const plan = planStockBinWrites([
      row({ location_id: 5, location_name: 'Unboxing Area', location_barcode: '  ' }),
    ]);

    assert.deepEqual(plan.targets, []);
    assert.deepEqual(
      plan.skipped.map((s) => s.refusal),
      ['no-barcode'],
    );
  });

  it('names every refusal in the selection, not just the first', () => {
    const plan = planStockBinWrites([
      row(),
      row({ source: 'unit' }),
      row({ location_id: null, location_barcode: null, location_name: 'QA-BIN-1' }),
    ]);

    assert.equal(plan.targets.length, 1);
    assert.match(plan.note ?? '', /^2 of 3 rows skipped: /);
    assert.match(plan.note ?? '', /unit desk/);
    assert.match(plan.note ?? '', /re-place it first/);
  });

  it('an empty selection plans nothing and says nothing', () => {
    const plan = planStockBinWrites([]);
    assert.deepEqual(plan.targets, []);
    assert.deepEqual(plan.skipped, []);
    assert.equal(plan.note, null);
  });
});
