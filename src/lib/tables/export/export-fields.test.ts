import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import {
  exportFieldsFromCatalog,
  groupExportFields,
  isDefaultFieldSet,
  readStoredExportFieldIds,
  resolveExportFieldIds,
  toggleExportField,
  type ExportField,
} from './export-fields';

const CATALOG: FieldCatalog = [
  { id: 'orders.order_id', family: 'orders', label: 'Order', displayType: 'id', slotKinds: ['identity'] },
  { id: 'orders.qty', family: 'orders', label: 'Qty', displayType: 'number', slotKinds: ['status'] },
  { id: 'orders.amount', family: 'orders', label: 'Amount', displayType: 'money', slotKinds: ['status'] },
];

const FIELDS = exportFieldsFromCatalog(CATALOG, {
  defaults: ['orders.order_id', 'orders.qty'],
  group: 'Order facts',
  extras: [
    { id: 'record_id', label: 'Record id', group: 'Export only', default: false },
    { id: 'raw_created_at', label: 'Created (raw)', group: 'Export only', default: false },
  ],
});

describe('exportFieldsFromCatalog', () => {
  it('offers every catalog fact, bound or not', () => {
    // An operator who hid a column still wants it in the spreadsheet often
    // enough that tying the two together would be its own bug report.
    const ids = FIELDS.map((f) => f.id);
    for (const field of CATALOG) assert.ok(ids.includes(field.id), field.id);
  });

  it('marks only the named defaults', () => {
    assert.deepEqual(
      FIELDS.filter((f) => f.default).map((f) => f.id),
      ['orders.order_id', 'orders.qty'],
    );
  });

  it('defaults EVERYTHING when no default set is named — the blind download', () => {
    const all = exportFieldsFromCatalog(CATALOG);
    assert.equal(all.every((f) => f.default), true);
  });

  it('appends export-only extras and marks them as such', () => {
    const extra = FIELDS.find((f) => f.id === 'record_id');
    assert.equal(extra?.exportOnly, true);
  });

  it('lets the CATALOG win an id collision — one label, one place to rename it', () => {
    const fields = exportFieldsFromCatalog(CATALOG, {
      extras: [{ id: 'orders.qty', label: 'Quantity (raw)', default: true }],
    });
    assert.equal(fields.filter((f) => f.id === 'orders.qty').length, 1);
    assert.equal(fields.find((f) => f.id === 'orders.qty')?.label, 'Qty');
  });
});

describe('resolveExportFieldIds', () => {
  it('falls to the defaults when nothing is stored', () => {
    assert.deepEqual(resolveExportFieldIds(FIELDS, null), ['orders.order_id', 'orders.qty']);
  });

  it('honours a stored choice', () => {
    assert.deepEqual(resolveExportFieldIds(FIELDS, ['record_id', 'orders.amount']), [
      'orders.amount',
      'record_id',
    ]);
  });

  it('orders by the REGISTRY, not by the stored array', () => {
    // A stored order would freeze a layout against a registry that gains
    // fields, so a new fact would always land last however the family declared
    // it — and two orgs would get different column orders for no visible reason.
    assert.deepEqual(
      resolveExportFieldIds(FIELDS, ['orders.amount', 'orders.order_id']),
      resolveExportFieldIds(FIELDS, ['orders.order_id', 'orders.amount']),
    );
  });

  it('drops an id the registry no longer knows', () => {
    assert.deepEqual(resolveExportFieldIds(FIELDS, ['orders.qty', 'orders.retired']), [
      'orders.qty',
    ]);
  });

  it('falls back rather than writing a HEADER-ONLY file', () => {
    assert.deepEqual(resolveExportFieldIds(FIELDS, ['gone', 'also-gone']), [
      'orders.order_id',
      'orders.qty',
    ]);
  });
});

describe('isDefaultFieldSet', () => {
  it('is true with nothing stored', () => {
    assert.equal(isDefaultFieldSet(FIELDS, null), true);
  });

  it('is true for a stored set that equals the defaults', () => {
    assert.equal(isDefaultFieldSet(FIELDS, ['orders.order_id', 'orders.qty']), true);
  });

  it('is true regardless of the stored ORDER, since order is the registry’s', () => {
    assert.equal(isDefaultFieldSet(FIELDS, ['orders.qty', 'orders.order_id']), true);
  });

  it('is false once the operator adds a field', () => {
    assert.equal(isDefaultFieldSet(FIELDS, ['orders.order_id', 'orders.qty', 'record_id']), false);
  });
});

describe('toggleExportField', () => {
  it('adds a field and keeps registry order', () => {
    assert.deepEqual(toggleExportField(FIELDS, null, 'orders.amount'), [
      'orders.order_id',
      'orders.qty',
      'orders.amount',
    ]);
  });

  it('removes a chosen field', () => {
    assert.deepEqual(toggleExportField(FIELDS, null, 'orders.qty'), ['orders.order_id']);
  });

  it('can empty the set — the CONTROL decides what to do about that', () => {
    let chosen = toggleExportField(FIELDS, null, 'orders.qty');
    chosen = toggleExportField(FIELDS, chosen, 'orders.order_id');
    assert.deepEqual(chosen, []);
    // …and resolving an empty choice falls back rather than exporting nothing.
    assert.deepEqual(resolveExportFieldIds(FIELDS, chosen), ['orders.order_id', 'orders.qty']);
  });
});

describe('groupExportFields', () => {
  it('bands in declaration order', () => {
    assert.deepEqual(
      groupExportFields(FIELDS).map((b) => b.key),
      ['Order facts', 'Export only'],
    );
  });

  it('leads with the unnamed band so an ungrouped registry renders flat', () => {
    const flat: ExportField[] = [
      { id: 'a', label: 'A', default: true },
      { id: 'b', label: 'B', group: 'Later', default: true },
    ];
    assert.deepEqual(groupExportFields(flat).map((b) => b.key), ['', 'Later']);
  });
});

describe('readStoredExportFieldIds', () => {
  it('reads a list of ids', () => {
    assert.deepEqual(readStoredExportFieldIds(['a', 'b']), ['a', 'b']);
  });

  it('is null for anything that is not a list — "no choice", not an empty one', () => {
    for (const raw of [null, undefined, {}, 'a', 3, []]) {
      assert.equal(readStoredExportFieldIds(raw), null);
    }
  });

  it('drops non-string entries', () => {
    assert.deepEqual(readStoredExportFieldIds(['a', 7, null, '']), ['a']);
  });
});
