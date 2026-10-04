/** Order-import-staging catalog guards + sheet materialization — wave 1.4's tenth family and the last of the wave. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CSV_IMPORT_STAGING_SHEET_COLUMNS,
  csvImportStagingSheetColumnsFor,
  csvImportStagingSortFactFor,
} from '@/components/outbound/orders/import-staging/csv-import-staging-grid-layout';
import { ORDERS_IMPORT_FIELD_CATALOG, ORDERS_IMPORT_PRODUCT_LAYOUT } from './orders-import';

describe('orders-import catalog', () => {
  it('has unique ids, all family-qualified, each bindable somewhere', () => {
    const ids = ORDERS_IMPORT_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of ORDERS_IMPORT_FIELD_CATALOG) {
      assert.equal(field.family, 'orders-import', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('orders-import.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the whole set)', () => {
    const parsed = ORDERS_IMPORT_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'orders-import.order');
    assert.equal(parsed.statusBindings.length, 5);
  });

  it('the triage STATUS is structural — a staging queue must always say what blocks', () => {
    assert.ok(!ORDERS_IMPORT_FIELD_CATALOG.some((f) => f.id === 'orders-import.status'));
    const status = CSV_IMPORT_STAGING_SHEET_COLUMNS.find((c) => c.key === 'status');
    assert.ok(status, 'the status track is mounted');
    assert.equal(status.fieldId, undefined);
  });

  it('names no find-bar-only fact — those are search targets, not tracks', () => {
    const ids = ORDERS_IMPORT_FIELD_CATALOG.map((f) => f.id);
    for (const absent of [
      'orders-import.itemNumber',
      'orders-import.itemTitle',
      'orders-import.weightOz',
      'orders-import.assigneeTech',
      'orders-import.assigneePacker',
    ]) {
      assert.ok(!ids.includes(absent), `${absent} is not a track`);
    }
  });
});

describe('csvImportStagingSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's scan order", () => {
    assert.deepEqual(
      CSV_IMPORT_STAGING_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['order', null],
        ['status', null],
        ['status:1', 'orders-import.sku'],
        ['status:2', 'orders-import.qty'],
        ['status:3', 'orders-import.customer'],
        ['status:4', 'orders-import.tracking'],
        ['status:5', 'orders-import.platform'],
        ['_fill', null],
      ],
    );
  });

  it('the trailing _fill owns the sole flex track and never sorts', () => {
    const flex = CSV_IMPORT_STAGING_SHEET_COLUMNS.filter((c) => String(c.width).includes('1fr'));
    assert.deepEqual(flex.map((c) => c.key), ['_fill']);
    const fill = CSV_IMPORT_STAGING_SHEET_COLUMNS.at(-1);
    assert.equal(fill?.key, '_fill');
    assert.equal(csvImportStagingSortFactFor(fill!), null);
  });

  it('the structural fact tracks keep their own sort words', () => {
    const byKey = new Map(
      CSV_IMPORT_STAGING_SHEET_COLUMNS.map((c) => [c.key, csvImportStagingSortFactFor(c)]),
    );
    assert.equal(byKey.get('select'), null);
    assert.equal(byKey.get('order'), 'orders-import.order');
    assert.equal(byKey.get('status'), 'status');
    assert.equal(byKey.get('status:2'), 'orders-import.qty');
  });

  it('the _fill track stays last however many facts are bound', () => {
    const columns = csvImportStagingSheetColumnsFor({
      ...ORDERS_IMPORT_PRODUCT_LAYOUT,
      subtitleBindings: [{ fieldId: 'orders-import.customer' }],
      statusBindings: [{ fieldId: 'orders-import.sku' }],
    });
    assert.equal(columns.at(-1)?.key, '_fill');
  });
});
