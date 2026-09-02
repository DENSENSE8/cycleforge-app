/**
 * Shortage-coverage-import catalog guards + resolver behaviour.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS,
  shortageCoverageStagingSheetColumnsFor,
  shortageCoverageStagingSortFactFor,
} from '@/components/outbound/orders/shortage-coverage-staging/shortage-coverage-staging-grid-layout';
import type { ShortageCoverageImportRowView } from '@/lib/orders/shortage-coverage-import-descriptor';
import {
  SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG,
  SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT,
} from './shortage-coverage-import';
import { resolveShortageCoverageImportSlotValue } from './shortage-coverage-import-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<ShortageCoverageImportRowView> = {}): ShortageCoverageImportRowView {
  return {
    index: 0,
    status: 'ready',
    missing: [],
    duplicate: false,
    orderNumber: '113-1679301-5337863',
    sku: '',
    itemNumber: '',
    itemTitle: 'Bose TV Speaker',
    shortQty: '1',
    shipByDate: '8/28/2026',
    poNumber: '',
    inboundTracking: '9261290983197850083534',
    eta: '',
    coverageLabel: 'Awaiting inbound',
    ...overrides,
  };
}

describe('shortage-coverage-import catalog', () => {
  it('has unique ids, all family-qualified, each bindable somewhere', () => {
    const ids = SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG) {
      assert.equal(field.family, 'shortage-coverage-import', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('shortage-coverage-import.'));
    }
  });

  it('product default parses against the catalog', () => {
    const parsed = parseSlotLayout(
      SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT,
      SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG,
    );
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'shortage-coverage-import.order');
    assert.equal(parsed.statusBindings.length, 5);
  });

  it('the triage STATUS is structural', () => {
    assert.ok(
      !SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG.some(
        (f) => f.id === 'shortage-coverage-import.status',
      ),
    );
    const status = SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS.find((c) => c.key === 'status');
    assert.ok(status);
    assert.equal(status.fieldId, undefined);
  });
});

describe('shortageCoverageStagingSheetColumnsFor', () => {
  it('product default scan order', () => {
    assert.deepEqual(
      SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['order', null],
        ['status', null],
        ['status:1', 'shortage-coverage-import.title'],
        ['status:2', 'shortage-coverage-import.qty'],
        ['status:3', 'shortage-coverage-import.coverage'],
        ['status:4', 'shortage-coverage-import.po'],
        ['status:5', 'shortage-coverage-import.inbound'],
        ['_fill', null],
      ],
    );
  });

  it('the trailing _fill owns the sole flex track and never sorts', () => {
    const flex = SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS.filter((c) =>
      String(c.width).includes('1fr'),
    );
    assert.deepEqual(flex.map((c) => c.key), ['_fill']);
    assert.equal(shortageCoverageStagingSortFactFor(SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS.at(-1)!), null);
  });

  it('the _fill track stays last however many facts are bound', () => {
    const columns = shortageCoverageStagingSheetColumnsFor({
      ...SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'shortage-coverage-import.coverage' }],
    });
    assert.equal(columns.at(-1)?.key, '_fill');
  });
});

describe('resolveShortageCoverageImportSlotValue', () => {
  it('coverage paints the SoT label, qty stays what the file said', () => {
    assert.deepEqual(resolveShortageCoverageImportSlotValue(row(), 'shortage-coverage-import.qty'), {
      kind: 'value',
      text: '1',
    });
    assert.deepEqual(
      resolveShortageCoverageImportSlotValue(row(), 'shortage-coverage-import.coverage'),
      { kind: 'value', text: 'Awaiting inbound' },
    );
  });

  it('unknown field id resolves null', () => {
    assert.equal(resolveShortageCoverageImportSlotValue(row(), 'shortage-coverage-import.ghost'), null);
  });
});
