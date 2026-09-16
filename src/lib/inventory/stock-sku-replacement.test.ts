/**
 * The Stock desk's SKU-replacement precondition.
 *
 * Two writes hide behind one operator question, and picking the wrong one is
 * not a cosmetic error: `pair` re-keys a placeholder's whole ledger history
 * warehouse-wide and deletes the placeholder, while `swap` moves a quantity
 * between two SKUs in ONE bin. So the direction, the one-source-SKU rule and
 * the two refusals are pinned here rather than trusted to the strip.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planStockSkuReplacement,
  stockReplacementLabel,
  stockReplacementSourceFace,
  stockReplacementTargetRefusal,
} from './stock-sku-replacement';
import type { LocationStockTableRow } from './location-stock-row';

function row(over: Partial<LocationStockTableRow> = {}): LocationStockTableRow {
  return {
    location_id: 12,
    location_name: 'A-01-01',
    location_barcode: 'BIN-A-01-01',
    room: 'Annex',
    row_label: '01',
    col_label: '01',
    sku: 'SKU-REAL',
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

describe('planStockSkuReplacement', () => {
  it('a real SKU on bin rows swaps, per bin', () => {
    const plan = planStockSkuReplacement([
      row(),
      row({ location_id: 13, location_barcode: 'BIN-B-02', qty: 2 }),
    ]);

    assert.equal(plan.kind, 'swap');
    assert.equal(plan.blocked, null);
    assert.equal(plan.sourceSku, 'SKU-REAL');
    assert.deepEqual(
      plan.targets.map((t) => [t.barcode, t.qty]),
      [
        ['BIN-A-01-01', 7],
        ['BIN-B-02', 2],
      ],
    );
    assert.equal(stockReplacementLabel(plan.kind), 'Replace SKU');
  });

  it('a placeholder SKU pairs, and carries no per-bin targets because the write is SKU-wide', () => {
    const plan = planStockSkuReplacement([
      row({ sku: 'TMP-FJRJRB', product_title: 'WMS BACKLIT CRADLE' }),
    ]);

    assert.equal(plan.kind, 'pair');
    assert.equal(plan.blocked, null);
    // The merge reaches every bin the placeholder touched, not the ticked one,
    // so a per-bin target list here would be a lie about the blast radius.
    assert.deepEqual(plan.targets, []);
    assert.equal(stockReplacementLabel(plan.kind), 'Pair to real SKU');
    assert.equal(
      stockReplacementSourceFace(plan),
      'WMS BACKLIT CRADLE · TMP-FJRJRB',
    );
  });

  it('refuses two SKUs in one selection and says how many', () => {
    const plan = planStockSkuReplacement([row(), row({ sku: 'SKU-OTHER' })]);

    assert.equal(plan.kind, null);
    assert.equal(plan.sourceSku, null);
    assert.match(plan.blocked ?? '', /one SKU at a time — 2 are selected/);
  });

  it('refuses to pair a placeholder that has serialized units standing somewhere', () => {
    // `mergeProvisionalSku` re-keys bin rows and the ledger, never
    // `serial_units`, and then deletes the placeholder's catalog row — which a
    // unit still pointing at it would refuse as a constraint name.
    const plan = planStockSkuReplacement([
      row({ sku: 'TMP-ABC', source: 'bin' }),
      row({ sku: 'TMP-ABC', source: 'unit', location_id: 44, qty: 2 }),
    ]);

    assert.equal(plan.kind, null);
    assert.match(plan.blocked ?? '', /serialized units/);
    assert.match(plan.blocked ?? '', /unit desk/);
  });

  it('refuses a real SKU whose selected rows cannot reach a bin endpoint', () => {
    const plan = planStockSkuReplacement([row({ source: 'unit' })]);

    assert.equal(plan.kind, null);
    // The reason is the bin planner's own sentence, so the operator reads the
    // same explanation here as on Adjust and Move.
    assert.match(plan.blocked ?? '', /serialized unit/);
  });

  it('an empty selection asks for a row rather than claiming a direction', () => {
    const plan = planStockSkuReplacement([]);
    assert.equal(plan.kind, null);
    assert.equal(plan.blocked, 'Select a row first');
  });
});

describe('stockReplacementTargetRefusal', () => {
  it('passes a real, different target', () => {
    assert.equal(stockReplacementTargetRefusal('TMP-ABC', 'SKU-REAL'), null);
  });

  it('refuses the SKU the rows already carry', () => {
    assert.equal(stockReplacementTargetRefusal('SKU-REAL', 'sku-real'), 'That is the same SKU');
  });

  it('refuses chaining one placeholder onto another', () => {
    assert.match(
      stockReplacementTargetRefusal('TMP-ABC', 'TMP-DEF') ?? '',
      /placeholder cannot be the target/,
    );
  });

  it('says nothing while no target is picked — an empty field is not an error', () => {
    assert.equal(stockReplacementTargetRefusal('SKU-REAL', '   '), null);
  });
});
