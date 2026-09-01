/**
 * Import-exception catalog guards + resolver behaviour — wave 1.3's sixth and
 * last family. Review's two queues share one page and one cell map; the guard
 * that matters most is the one pinning that they do NOT share a vocabulary.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import {
  IMPORT_EXCEPTION_COMPOUND_COLUMNS,
  importExceptionCompoundColumnsFor,
} from '@/features/review/catalog-link/grid/import-exception-grid-layout';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import { CATALOG_LINK_FIELD_CATALOG } from './catalog-link';
import {
  IMPORT_EXCEPTION_FIELD_CATALOG,
  IMPORT_EXCEPTION_PRODUCT_LAYOUT,
} from './import-exception';
import {
  importExceptionSlotValuesFor,
  resolveImportExceptionSlotValue,
} from './import-exception-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<ImportExceptionRow> = {}): ImportExceptionRow {
  return {
    id: 12,
    accountOrderId: '09-88231-44120',
    accountSource: 'eBay',
    productTitle: 'Bose Solo 5',
    tracking: '1Z999AA10123456784',
    status: 'open',
    sheetRow: 42,
    resolvedItemNumber: null,
    resolvedOrderId: null,
    seenCount: 3,
    firstSeenAt: '2026-08-18T09:00:00.000Z',
    lastSeenAt: '2026-08-30T09:00:00.000Z',
    ...overrides,
  };
}

describe('import-exception catalog', () => {
  it('has unique ids, all import-exception-family, each bindable somewhere', () => {
    const ids = IMPORT_EXCEPTION_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of IMPORT_EXCEPTION_FIELD_CATALOG) {
      assert.equal(field.family, 'import-exception', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(
        field.id.startsWith('import-exception.'),
        `${field.id} is not family-qualified`,
      );
    }
  });

  it('shares NO field id with catalog-link, though the two queues share a page', () => {
    const other = new Set(CATALOG_LINK_FIELD_CATALOG.map((f) => f.id));
    for (const field of IMPORT_EXCEPTION_FIELD_CATALOG) {
      assert.ok(!other.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('product default parses against the catalog — compound morph, NOTHING bound', () => {
    const parsed = parseSlotLayout(
      IMPORT_EXCEPTION_PRODUCT_LAYOUT,
      IMPORT_EXCEPTION_FIELD_CATALOG,
    );
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'import-exception.order');
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
  });

  it('names no status fact — every row in this queue is missing an item # by definition', () => {
    const ids = IMPORT_EXCEPTION_FIELD_CATALOG.map((f) => f.id);
    assert.ok(!ids.includes('import-exception.status'));
  });
});

describe('importExceptionCompoundColumnsFor — the compound materialization', () => {
  it('the product default IS the shared compound skeleton, in order', () => {
    assert.deepEqual(
      IMPORT_EXCEPTION_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
    assert.ok(IMPORT_EXCEPTION_COMPOUND_COLUMNS.every((c) => c.fieldId === undefined));
  });

  it('bound facts open status tracks after the state pill', () => {
    const columns = importExceptionCompoundColumnsFor({
      ...IMPORT_EXCEPTION_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'import-exception.sheet' }, { fieldId: 'import-exception.seen' }],
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ['select', 'thumb', 'fulfillment', 'item', 'state', 'status:1', 'status:2', 'amount', 'actions', '_fill'],
    );
  });
});

describe('resolveImportExceptionSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveImportExceptionSlotValue(r, 'import-exception.order'), {
      kind: 'value',
      text: '09-88231-44120',
    });
    assert.deepEqual(resolveImportExceptionSlotValue(r, 'import-exception.sheet'), {
      kind: 'value',
      text: '42',
    });
    assert.deepEqual(resolveImportExceptionSlotValue(r, 'import-exception.seen'), {
      kind: 'value',
      text: '×3',
    });
    assert.ok(
      (resolveImportExceptionSlotValue(r, 'import-exception.source') as { text: string | null })
        .text,
    );
  });

  it('seen-once carries no signal, so it paints nothing', () => {
    assert.deepEqual(resolveImportExceptionSlotValue(row({ seenCount: 1 }), 'import-exception.seen'), {
      kind: 'value',
      text: null,
    });
  });

  it('a row with no sheet origin reads blank, never row 0', () => {
    assert.deepEqual(resolveImportExceptionSlotValue(row({ sheetRow: null }), 'import-exception.sheet'), {
      kind: 'value',
      text: null,
    });
  });

  it('honest absence: an untracked exception has no tracking to show', () => {
    assert.deepEqual(
      resolveImportExceptionSlotValue(row({ tracking: null }), 'import-exception.tracking'),
      { kind: 'value', text: null },
    );
  });

  it('a catalog-link field id resolves to nothing here — bindings never cross queues', () => {
    assert.equal(resolveImportExceptionSlotValue(row(), 'catalog-link.sku'), null);
  });
});

describe('importExceptionSlotValuesFor', () => {
  it('keys resolved values by TRACK key', () => {
    const columns = importExceptionCompoundColumnsFor({
      ...IMPORT_EXCEPTION_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'import-exception.sheet' }],
    });
    assert.deepEqual(importExceptionSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: '42' },
    });
  });

  it('the product default resolves no slots at all', () => {
    assert.equal(importExceptionSlotValuesFor(row(), IMPORT_EXCEPTION_COMPOUND_COLUMNS), undefined);
  });
});
