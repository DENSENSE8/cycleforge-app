/**
 * Google Sheets sync → the To-ship inline triage board.
 *
 * The predicate for `docs/eval/goals/sheets-sync-inline-triage.goal.json`. What
 * it defends is the behaviour an operator can see: a sheet sync ends with its
 * rows ON the staging LedgerGrid as approve / reject decisions, a re-sync lands
 * them in the MIDDLE of what is already there without re-attributing anybody's
 * verdict, and an approval is reversible because the source is a person.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  ORDER_IMPORT_DESCRIPTOR,
  ORDER_IMPORT_SURFACE_ID,
} from '@/lib/orders/order-import-descriptor';
import {
  clearTableImportDraft,
  getTableImportDraft,
  listTableImportRows,
  loadTableImportDraft,
  setTableImportRowDecision,
  setTableImportSelected,
  tableImportDecisionTargets,
  discardTableImportSelected,
} from '@/lib/tables/import/staging-store';
import {
  SHEET_TRIAGE_HEADERS,
  SHEET_TRIAGE_ORIGIN,
  isCagedSheetUpdate,
  landSheetTriageRows,
  nextSheetTriageDecision,
  sheetTriageInsertIndex,
  sheetTriageRecords,
  sheetTriageRowsFromDetails,
} from '@/lib/orders-sync/sheets-inline-triage';
import {
  CSV_IMPORT_STAGING_GUTTER_REM,
  CSV_IMPORT_STAGING_SHEET_COLUMNS,
  csvImportStagingSortFactFor,
} from '@/components/outbound/orders/import-staging/csv-import-staging-grid-layout';
import type { TransferOrderDetail, TransferOrderDetails } from '@/lib/orders-sync/types';

const SURFACE = ORDER_IMPORT_SURFACE_ID;

/** An eBay 2-5-5 id names its own channel, so the row classifies Ready. */
const READY_ID = '03-15100-78272';
const READY_ID_2 = '03-15100-78273';
/** No recognizable shape and no platform column value → Action required. */
const UNSHAPED_ID = 'HANDWRITTEN-1';

function detail(overrides: Partial<TransferOrderDetail> = {}): TransferOrderDetail {
  return {
    orderId: READY_ID,
    productTitle: 'Shimano Ultegra R8000',
    sku: 'SHI-R8000',
    itemNumber: '1155501',
    tracking: '9400111899223197428490',
    titleSource: 'sheet',
    ...overrides,
  };
}

function details(overrides: Partial<TransferOrderDetails> = {}): TransferOrderDetails {
  return {
    inserted: [],
    updated: [],
    deleted: [],
    unknownTitle: [],
    unresolvedTracking: [],
    unmatchedCatalog: [],
    ...overrides,
  };
}

beforeEach(() => {
  clearTableImportDraft(SURFACE);
});

describe('which synced rows are triageable', () => {
  it('takes the inserted rows', () => {
    const rows = sheetTriageRowsFromDetails(
      details({ inserted: [detail(), detail({ orderId: READY_ID_2 })] }),
    );
    assert.deepEqual(rows.map((r) => r.orderId), [READY_ID, READY_ID_2]);
  });

  it('takes an updated row the sheet still owns', () => {
    assert.equal(isCagedSheetUpdate(detail({ existingAccountSource: null })), true);
    assert.equal(
      isCagedSheetUpdate(detail({ existingAccountSource: 'google-sheets-transfer-orders' })),
      true,
    );
    const rows = sheetTriageRowsFromDetails(
      details({ updated: [detail({ existingAccountSource: '  ' })] }),
    );
    assert.equal(rows.length, 1);
  });

  it('leaves an API connector’s order alone — that row is not the sheet’s to approve', () => {
    assert.equal(isCagedSheetUpdate(detail({ existingAccountSource: 'ecwid' })), false);
    const rows = sheetTriageRowsFromDetails(
      details({ updated: [detail({ existingAccountSource: 'ebay' })] }),
    );
    assert.deepEqual(rows, []);
  });

  it('never paints one order id twice', () => {
    const rows = sheetTriageRowsFromDetails(
      details({
        inserted: [detail()],
        updated: [detail({ existingAccountSource: null })],
      }),
    );
    assert.equal(rows.length, 1);
  });

  it('keeps two blank-id rows apart — a blank is not an identity', () => {
    const rows = sheetTriageRowsFromDetails(
      details({ inserted: [detail({ orderId: '' }), detail({ orderId: '' })] }),
    );
    assert.equal(rows.length, 2);
  });

  it('an empty run lands nothing', () => {
    assert.deepEqual(sheetTriageRowsFromDetails(details()), []);
    assert.deepEqual(sheetTriageRowsFromDetails(null), []);
    assert.deepEqual(landSheetTriageRows(details(), 'Sheet_09_02_2026'), {
      ok: false,
      reason: 'no-rows',
    });
    assert.equal(getTableImportDraft(SURFACE), null);
  });
});

describe('the records speak the canonical import vocabulary', () => {
  it('binds every header the descriptor auto-maps', () => {
    const mapping = ORDER_IMPORT_DESCRIPTOR.autoMap([...SHEET_TRIAGE_HEADERS]);
    assert.deepEqual(mapping, {
      order_number: 'Order number',
      item_title: 'Item title',
      sku: 'SKU',
      item_number: 'Item number',
      tracking_number: 'Tracking number',
      platform: 'Platform',
    });
  });

  it('carries the sheet’s facts onto the row view', () => {
    const [record] = sheetTriageRecords([detail()]);
    const view = ORDER_IMPORT_DESCRIPTOR.toRowView(
      record,
      ORDER_IMPORT_DESCRIPTOR.autoMap([...SHEET_TRIAGE_HEADERS]),
      0,
    );
    assert.equal(view.orderNumber, READY_ID);
    assert.equal(view.sku, 'SHI-R8000');
    assert.equal(view.itemNumber, '1155501');
    assert.equal(view.trackingNumber, '9400111899223197428490');
    assert.equal(view.status, 'ready');
  });

  it('a sheet row whose id names no channel is Action required, not silently Ready', () => {
    const [record] = sheetTriageRecords([detail({ orderId: UNSHAPED_ID })]);
    const { status, missing } = ORDER_IMPORT_DESCRIPTOR.classify(
      record,
      ORDER_IMPORT_DESCRIPTOR.autoMap([...SHEET_TRIAGE_HEADERS]),
    );
    assert.equal(status, 'action_required');
    assert.deepEqual(missing, ['platform']);
  });
});

describe('landing the rows on the board', () => {
  it('a sync with no draft open creates the decision board', () => {
    const landing = landSheetTriageRows(
      details({ inserted: [detail(), detail({ orderId: READY_ID_2 })] }),
      'Sheet_09_02_2026',
    );
    assert.deepEqual(landing, { ok: true, landed: 2, insertedAt: 0, created: true });

    const draft = getTableImportDraft(SURFACE)!;
    assert.equal(draft.origin, SHEET_TRIAGE_ORIGIN);
    assert.equal(draft.fileName, 'Sheet_09_02_2026');
    assert.equal(draft.rows.length, 2);
    // The rows are on the GRID, not only in the sync dialog's lists.
    assert.deepEqual(
      listTableImportRows(ORDER_IMPORT_DESCRIPTOR, draft).map((v) => v.orderNumber),
      [READY_ID, READY_ID_2],
    );
  });

  it('refuses to overwrite an operator’s open CSV draft', () => {
    loadTableImportDraft(ORDER_IMPORT_DESCRIPTOR, {
      fileName: 'hand.csv',
      headers: ['Order'],
      rows: [{ Order: READY_ID }],
    });
    assert.deepEqual(landSheetTriageRows(details({ inserted: [detail()] }), 'Sheet_09_02_2026'), {
      ok: false,
      reason: 'file-draft-open',
    });
    const draft = getTableImportDraft(SURFACE)!;
    assert.equal(draft.origin, 'file');
    assert.equal(draft.fileName, 'hand.csv');
    assert.equal(draft.rows.length, 1);
  });
});

describe('rows enter the MIDDLE of the body', () => {
  it('splits an existing board rather than appending under it', () => {
    assert.equal(sheetTriageInsertIndex(0), 0);
    assert.equal(sheetTriageInsertIndex(4), 2);
    assert.equal(sheetTriageInsertIndex(5), 2);
  });

  it('a second sync splices between the rows already there', () => {
    landSheetTriageRows(
      details({
        inserted: [
          detail({ orderId: 'A1' }),
          detail({ orderId: 'A2' }),
          detail({ orderId: 'A3' }),
          detail({ orderId: 'A4' }),
        ],
      }),
      'Sheet_09_01_2026',
    );
    const before = getTableImportDraft(SURFACE)!;
    const idsBefore = [...before.rowIds];

    const landing = landSheetTriageRows(
      details({ inserted: [detail({ orderId: 'NEW' })] }),
      'Sheet_09_02_2026',
    );
    assert.deepEqual(landing, { ok: true, landed: 1, insertedAt: 2, created: false });

    const after = getTableImportDraft(SURFACE)!;
    assert.deepEqual(
      after.rows.map((r) => r['Order number']),
      ['A1', 'A2', 'NEW', 'A3', 'A4'],
    );
    // The rows that were already painted keep their identity across the splice.
    // Without this the grid remounts every row below the seam, and the rows
    // that are supposed to visibly make room vanish and re-enter instead.
    assert.deepEqual(
      [after.rowIds[0], after.rowIds[1], after.rowIds[3], after.rowIds[4]],
      idsBefore,
    );
    assert.equal(new Set(after.rowIds).size, 5, 'every row id is distinct');
  });

  it('carries selection and verdicts across the seam', () => {
    landSheetTriageRows(
      details({
        inserted: [detail({ orderId: 'A1' }), detail({ orderId: 'A2' })],
      }),
      'Sheet_09_01_2026',
    );
    setTableImportSelected(SURFACE, [1]);
    setTableImportRowDecision(SURFACE, 1, 'approved');

    landSheetTriageRows(details({ inserted: [detail({ orderId: 'NEW' })] }), 'Sheet_09_02_2026');

    const draft = getTableImportDraft(SURFACE)!;
    assert.deepEqual(
      draft.rows.map((r) => r['Order number']),
      ['A1', 'NEW', 'A2'],
    );
    // `A2` moved from index 1 to index 2 — its approval and its checkmark
    // moved with it, rather than being handed to the row that took the slot.
    assert.deepEqual([...draft.selectedIndexes], [2]);
    assert.equal(draft.decisions.get(2), 'approved');
    assert.equal(draft.decisions.get(1), undefined);
  });
});

describe('approve / unapprove / reject', () => {
  it('approve is reversible — the source is a person, not an API', () => {
    assert.equal(nextSheetTriageDecision(undefined, 'approve'), 'approved');
    assert.equal(nextSheetTriageDecision('approved', 'approve'), null);
    assert.equal(nextSheetTriageDecision('rejected', 'approve'), 'approved');
  });

  it('reject is reversible by the same square', () => {
    assert.equal(nextSheetTriageDecision(undefined, 'reject'), 'rejected');
    assert.equal(nextSheetTriageDecision('rejected', 'reject'), null);
    assert.equal(nextSheetTriageDecision('approved', 'reject'), 'rejected');
  });

  it('an unapproved row is UNDECIDED again, not rejected', () => {
    landSheetTriageRows(details({ inserted: [detail()] }), 'Sheet_09_02_2026');
    setTableImportRowDecision(SURFACE, 0, 'approved');
    assert.equal(getTableImportDraft(SURFACE)!.decisions.get(0), 'approved');

    setTableImportRowDecision(SURFACE, 0, null);
    const draft = getTableImportDraft(SURFACE)!;
    assert.equal(draft.decisions.has(0), false);
    assert.deepEqual(tableImportDecisionTargets(ORDER_IMPORT_DESCRIPTOR, draft), {
      indexes: [],
      approved: 0,
      rejected: 0,
      undecided: 1,
      blocked: 0,
    });
  });
});

describe('what the board commits', () => {
  it('writes only the approved rows, and only the ones that are Ready', () => {
    landSheetTriageRows(
      details({
        inserted: [
          detail({ orderId: READY_ID }),
          detail({ orderId: READY_ID_2 }),
          detail({ orderId: UNSHAPED_ID }),
          detail({ orderId: 'A4' }),
        ],
      }),
      'Sheet_09_02_2026',
    );
    setTableImportRowDecision(SURFACE, 0, 'approved');
    setTableImportRowDecision(SURFACE, 1, 'rejected');
    // Approved but still missing its channel — accepted by the operator, not
    // yet writable. It must stay on the board rather than go in silently.
    setTableImportRowDecision(SURFACE, 2, 'approved');

    const draft = getTableImportDraft(SURFACE)!;
    assert.deepEqual(tableImportDecisionTargets(ORDER_IMPORT_DESCRIPTOR, draft), {
      indexes: [0],
      approved: 2,
      rejected: 1,
      undecided: 1,
      blocked: 1,
    });
  });

  it('a rejected row is never in the commit set', () => {
    landSheetTriageRows(details({ inserted: [detail()] }), 'Sheet_09_02_2026');
    setTableImportRowDecision(SURFACE, 0, 'rejected');
    const targets = tableImportDecisionTargets(
      ORDER_IMPORT_DESCRIPTOR,
      getTableImportDraft(SURFACE)!,
    );
    assert.deepEqual(targets.indexes, []);
    assert.equal(targets.rejected, 1);
  });

  it('discarding rows carries the surviving verdicts down with them', () => {
    landSheetTriageRows(
      details({
        inserted: [
          detail({ orderId: 'A1' }),
          detail({ orderId: 'A2' }),
          detail({ orderId: 'A3' }),
        ],
      }),
      'Sheet_09_02_2026',
    );
    setTableImportRowDecision(SURFACE, 2, 'approved');
    setTableImportSelected(SURFACE, [0]);
    discardTableImportSelected(SURFACE);

    const draft = getTableImportDraft(SURFACE)!;
    assert.deepEqual(
      draft.rows.map((r) => r['Order number']),
      ['A2', 'A3'],
    );
    assert.equal(draft.decisions.get(1), 'approved');
    assert.equal(draft.rowIds.length, 2);
  });
});

describe('the decision gutter is chrome, and it matches the checkmark column', () => {
  it('is the LAST track, past the structural slack — the operator’s far right', () => {
    const keys = CSV_IMPORT_STAGING_SHEET_COLUMNS.map((c) => c.key);
    assert.equal(keys.at(-1), 'actions');
    // The slack still sits behind every FACT, so no fact column stretches.
    assert.equal(keys.at(-2), '_fill');
    assert.deepEqual(
      CSV_IMPORT_STAGING_SHEET_COLUMNS.filter((c) => String(c.width).includes('1fr')).map((c) => c.key),
      ['_fill'],
    );
  });

  it('never offers click-to-sort', () => {
    const actions = CSV_IMPORT_STAGING_SHEET_COLUMNS.find((c) => c.key === 'actions')!;
    assert.equal(csvImportStagingSortFactFor(actions), null);
  });

  it('is exactly two checkmark squares wide', () => {
    const select = CSV_IMPORT_STAGING_SHEET_COLUMNS.find((c) => c.key === 'select')!;
    const actions = CSV_IMPORT_STAGING_SHEET_COLUMNS.find((c) => c.key === 'actions')!;
    const rem = CSV_IMPORT_STAGING_GUTTER_REM;
    assert.equal(select.width, `minmax(${rem}rem, ${rem}rem)`);
    assert.equal(actions.width, `minmax(${rem * 2}rem, ${rem * 2}rem)`);
  });
});
