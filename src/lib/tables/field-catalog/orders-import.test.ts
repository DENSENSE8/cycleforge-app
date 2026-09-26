/** Order-import-staging catalog guards + resolver behaviour — wave 1.4's tenth family and the last of the wave. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CSV_IMPORT_STAGING_SHEET_COLUMNS,
  csvImportStagingSheetColumnsFor,
  csvImportStagingSortFactFor,
} from '@/components/outbound/orders/import-staging/csv-import-staging-grid-layout';
import type { OrderImportRowView } from '@/lib/orders/order-import-descriptor';
import { ORDERS_IMPORT_FIELD_CATALOG, ORDERS_IMPORT_PRODUCT_LAYOUT } from './orders-import';
import { resolveOrdersImportSlotValue } from './orders-import-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<OrderImportRowView> = {}): OrderImportRowView {
  return {
    index: 0,
    status: 'ready',
    missing: [],
    orderNumber: '09-88231-44120',
    sku: 'BOSE-WAVE-IV',
    itemNumber: '9M52B2C4',
    itemTitle: 'Bose Wave Radio IV',
    quantity: '02',
    customerName: 'Dana Vo',
    trackingNumber: '1Z999AA10123456784',
    platform: 'ebay',
    weightOz: '',
    assigneeTech: '',
    assigneePacker: '',
    ...overrides,
  } as OrderImportRowView;
}

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
    const parsed = parseSlotLayout(ORDERS_IMPORT_PRODUCT_LAYOUT, ORDERS_IMPORT_FIELD_CATALOG);
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

describe('resolveOrdersImportSlotValue', () => {
  it('shows what the FILE said — no coercion on a staging surface', () => {
    // `02` stays `02`. The row that would silently become `2` is exactly the
    // bug staging exists to catch.
    assert.deepEqual(resolveOrdersImportSlotValue(row(), 'orders-import.qty'), {
      kind: 'value',
      text: '02',
    });
  });

  it('resolves each catalog field off the staged row', () => {
    const r = row();
    assert.deepEqual(resolveOrdersImportSlotValue(r, 'orders-import.order'), {
      kind: 'value',
      text: '09-88231-44120',
    });
    assert.deepEqual(resolveOrdersImportSlotValue(r, 'orders-import.customer'), {
      kind: 'value',
      text: 'Dana Vo',
    });
    assert.ok(
      (resolveOrdersImportSlotValue(r, 'orders-import.platform') as { text: string | null }).text,
    );
  });

  it('an unrecognised channel reads back what the file said, never a blank', () => {
    const odd = resolveOrdersImportSlotValue(
      row({ platform: 'some-marketplace' }),
      'orders-import.platform',
    );
    assert.equal(odd?.kind, 'value');
    assert.ok((odd as { text: string | null }).text);
  });

  it('honest absence: an empty cell in the file resolves null', () => {
    const bare = row({ sku: '', trackingNumber: '', platform: '' });
    for (const id of ['orders-import.sku', 'orders-import.tracking', 'orders-import.platform']) {
      assert.deepEqual(resolveOrdersImportSlotValue(bare, id), { kind: 'value', text: null }, id);
    }
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveOrdersImportSlotValue(row(), 'orders-import.ghost'), null);
  });
});
