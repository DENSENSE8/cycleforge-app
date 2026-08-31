import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  ORDER_IMPORT_DESCRIPTOR,
  ORDER_IMPORT_SURFACE_ID,
} from '@/lib/orders/order-import-descriptor';
import {
  clearTableImportDraft,
  discardTableImportSelected,
  getTableImportDraft,
  listTableImportRows,
  loadTableImportDraft,
  setTableImportFilter,
  setTableImportMapping,
  setTableImportQuery,
  setTableImportSelected,
  summarizeTableImportDraft,
  tableImportConfirmTargets,
  updateTableImportRow,
} from '@/lib/tables/import/staging-store';

const D = ORDER_IMPORT_DESCRIPTOR;
const SURFACE = ORDER_IMPORT_SURFACE_ID;

function seed() {
  // Channel column present so these tests pin the STORE mechanics (filter /
  // selection / re-classify in place) rather than the orders vocabulary's
  // platform-acknowledgment rule, which has its own tests in
  // csv-order-import.test.ts.
  const outcome = loadTableImportDraft(D, {
    fileName: 't.csv',
    headers: ['Order', 'SKU', 'Channel'],
    rows: [
      { Order: 'O1', SKU: 'S1', Channel: 'ebay' },
      { Order: 'O2', SKU: '', Channel: 'ebay' },
      { Order: '', SKU: 'S3', Channel: 'ebay' },
    ],
    mapping: { order_number: 'Order', sku: 'SKU', platform: 'Channel' },
  });
  assert.equal(outcome.ok, true);
}

describe('table import staging store', () => {
  beforeEach(() => {
    clearTableImportDraft(SURFACE);
    clearTableImportDraft('other-family');
  });

  it('confirm targets EVERY ready row when nothing is selected', () => {
    seed();
    const live = getTableImportDraft(SURFACE)!;
    assert.deepEqual(tableImportConfirmTargets(D, live), {
      indexes: [0],
      scoped: false,
      skipped: 0,
    });
  });

  it('a selection NARROWS confirm and reports what it will skip', () => {
    seed();
    setTableImportSelected(SURFACE, [0, 1, 2]);
    const live = getTableImportDraft(SURFACE)!;
    assert.deepEqual(tableImportConfirmTargets(D, live), {
      indexes: [0],
      scoped: true,
      skipped: 2,
    });
  });

  it('filter ready isolates ready rows', () => {
    seed();
    setTableImportFilter(SURFACE, 'ready');
    const views = listTableImportRows(D, getTableImportDraft(SURFACE)!);
    assert.equal(views.length, 1);
    assert.equal(views[0].orderNumber, 'O1');
  });

  it('find narrows on the PROJECTED fields, and composes with the status filter', () => {
    seed();
    setTableImportQuery(SURFACE, 's3');
    let views = listTableImportRows(D, getTableImportDraft(SURFACE)!);
    assert.equal(views.length, 1);
    assert.equal(views[0].sku, 'S3');

    // S3's row is Action required, so the Ready lane must be empty rather than
    // one of the two narrowings silently winning.
    setTableImportFilter(SURFACE, 'ready');
    views = listTableImportRows(D, getTableImportDraft(SURFACE)!);
    assert.equal(views.length, 0);
  });

  it('batch counts read the WHOLE draft, never the filtered view', () => {
    seed();
    setTableImportFilter(SURFACE, 'ready');
    setTableImportQuery(SURFACE, 'nothing-matches-this');
    const live = getTableImportDraft(SURFACE)!;
    assert.equal(listTableImportRows(D, live).length, 0);
    assert.deepEqual(summarizeTableImportDraft(D, live), {
      total: 3,
      ready: 1,
      actionRequired: 2,
    });
  });

  it('an edit re-classifies the row in place — the state is derived, never stored', () => {
    seed();
    updateTableImportRow(D, 2, { order_number: 'O3' });
    const live = getTableImportDraft(SURFACE)!;
    const views = listTableImportRows(D, live);
    assert.equal(views[2].status, 'ready');
    assert.deepEqual(views[2].missing, []);
    assert.equal(summarizeTableImportDraft(D, live).ready, 2);
  });

  it('an edit to an UNMAPPED field is a no-op — there is nowhere to write it', () => {
    loadTableImportDraft(D, {
      fileName: 't.csv',
      headers: ['Order'],
      rows: [{ Order: 'O1' }],
      mapping: { order_number: 'Order' },
    });
    updateTableImportRow(D, 0, { tracking_number: '1Z999' });
    const live = getTableImportDraft(SURFACE)!;
    assert.deepEqual(live.rows[0], { Order: 'O1' });
    assert.equal(listTableImportRows(D, live)[0].trackingNumber, '');
  });

  it('discard selected removes rows', () => {
    seed();
    setTableImportSelected(SURFACE, [0]);
    discardTableImportSelected(SURFACE);
    const live = getTableImportDraft(SURFACE)!;
    assert.equal(live.rows.length, 2);
    assert.equal(live.rows[0].Order, 'O2');
  });

  it('drafts are keyed per family — one file never replaces another', () => {
    seed();
    // A second family's descriptor differs only in surface id for this test.
    const other = { ...D, surfaceId: 'other-family' };
    loadTableImportDraft(other, {
      fileName: 'cartons.csv',
      headers: ['Order'],
      rows: [{ Order: 'X1' }],
      mapping: { order_number: 'Order' },
    });
    assert.equal(getTableImportDraft(SURFACE)?.fileName, 't.csv');
    assert.equal(getTableImportDraft('other-family')?.fileName, 'cartons.csv');

    clearTableImportDraft('other-family');
    assert.equal(getTableImportDraft(SURFACE)?.rows.length, 3);
  });

  it('remapping clears a selection made against the OLD mapping', () => {
    seed();
    setTableImportSelected(SURFACE, [0, 1]);
    // Remapping re-derives readiness, so the old selection is not a set the
    // operator ever saw as Ready.
    setTableImportMapping(SURFACE, { order_number: 'Order' });
    assert.equal(getTableImportDraft(SURFACE)!.selectedIndexes.size, 0);
  });
});
