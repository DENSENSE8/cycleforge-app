/**
 * Run: npx tsx --test src/lib/integrations/connectors/google-sheets-orders.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import type { IngestCanonicalOrdersResult } from '@/lib/orders/ingest-canonical-orders';
import { collectEligibleRows, pickBackfillTabs, runSheetBackfill, type SheetBackfillDeps } from './google-sheets-orders';
import { bindSheetColumns } from '@/lib/orders/sources/google-sheet-rows';

const ORG = 'org-test' as OrgId;
const NOW = Date.UTC(2026, 8, 28, 12);
const HEADER = ['Ship by date', 'Order Number', 'Item Number', 'Item Title', 'Quantity', 'SKU', 'Condition', 'Tracking', 'Note', 'Platform'];

test('pickBackfillTabs: rolling window by the tab date, oldest first; full takes every dated tab', () => {
  const titles = ['Sheet_09_28_2026', 'Sheet_09_20_2026', 'Notes', 'Sheet_09_21_2026', 'Sheet_9_27_2026'];
  assert.deepEqual(pickBackfillTabs(titles, { now: NOW }), ['Sheet_09_21_2026', 'Sheet_9_27_2026', 'Sheet_09_28_2026']);
  assert.deepEqual(pickBackfillTabs(titles, { now: NOW, full: true }), [
    'Sheet_09_20_2026',
    'Sheet_09_21_2026',
    'Sheet_9_27_2026',
    'Sheet_09_28_2026',
  ]);
});

test('collectEligibleRows: gates FBA / no order / no tracking, ignores padding, and a re-paste across tabs is one line', () => {
  const { colIndices } = bindSheetColumns(HEADER);
  const row = (order: string, tracking: string, item = 'ITEM1') => ['', order, item, 'Widget', '1', 'SKU1', 'Used', tracking, '', 'eBay'];
  const { rows, skips, skipped, rowsRead } = collectEligibleRows([
    { title: 'Sheet_09_27_2026', cols: colIndices, rows: [row('111', '1Z999'), row('FBA19KD6XX28', '1Z1'), row('', '1Z2'), row('222', ''), ['', '', '']] },
    { title: 'Sheet_09_28_2026', cols: colIndices, rows: [row('111', '1z999'), row('333', '9400')] },
  ]);
  assert.equal(rowsRead, 6, 'padding is not a read row');
  assert.deepEqual(skips, { fbaShipment: 1, noOrderId: 1, noTracking: 1, duplicate: 1 });
  assert.deepEqual(rows.map((r) => r.row[1]), ['111', '333']);
  assert.deepEqual(
    rows.map((r) => [r.sheetTab, r.sheetRow]),
    [
      ['Sheet_09_28_2026', 2],
      ['Sheet_09_28_2026', 3],
    ],
    'rows[i] is sheet row i + 2 (row 1 is the header); the later paste is the line kept',
  );
  assert.deepEqual(
    skipped.map((s) => [s.reason, s.externalOrderId, s.sheetTab, s.sheetRow, s.accountSource]),
    [
      ['fbaShipment', 'FBA19KD6XX28', 'Sheet_09_27_2026', 3, 'eBay'],
      ['noTracking', '222', 'Sheet_09_27_2026', 5, 'eBay'],
      ['duplicate', '111', 'Sheet_09_27_2026', 2, 'eBay'],
    ],
    'a line with no order number is counted, never recorded',
  );
});

function fakeDeps(tabs: Record<string, unknown[][]>, details: Partial<IngestCanonicalOrdersResult['details']> = {}) {
  const ingested: CanonicalOrderLine[][] = [];
  const allocated: number[][] = [];
  const deps: SheetBackfillDeps = {
    listTabs: async () => Object.keys(tabs),
    readTabs: async (_org, titles) => titles.map((t) => tabs[t]),
    platformOf: async () => (source) => (source ?? '').trim().toLowerCase() || null,
    ingest: async (lines) => {
      ingested.push(lines);
      return {
        processedOrders: lines.length,
        insertedOrders: 1,
        insertedOrderIds: [42],
        updatedOrdersTracking: 1,
        updatedOrdersFields: 2,
        deletedDuplicateOrders: 0,
        ambiguousOrderIds: ['999'],
        unresolvedTrackingCount: 0,
        matchedCustomers: 0,
        unmatchedCustomers: 0,
        details: {
          inserted: [],
          updated: [],
          deleted: [],
          unknownTitle: [],
          unresolvedTracking: [],
          unmatchedCatalog: [],
          ambiguous: [],
          ...details,
        },
      };
    },
    allocate: async (_org, ids) => {
      allocated.push(ids);
    },
  };
  return { deps, ingested, allocated };
}

test('runSheetBackfill: every tab in scope lands in ONE ingest, inserts are allocated, counts come from the writer', async () => {
  const { deps, ingested, allocated } = fakeDeps({
    Sheet_09_27_2026: [HEADER, ['', '111', 'I1', 'Widget', '2', 'S1', 'Used', '1Z999', 'n', 'eBay']],
    Sheet_09_28_2026: [HEADER, ['', '222', 'I2', 'Gadget', '', 'S2', 'New', '9400111', '', 'Amazon']],
  });
  const out = await runSheetBackfill(ORG, deps, { now: NOW });
  assert.equal(out.ok, true);
  assert.equal(ingested.length, 1);
  assert.deepEqual(ingested[0].map((l) => [l.externalOrderId, l.accountSource, l.quantity, l.trackings]), [
    ['111', 'eBay', '2', ['1Z999']],
    ['222', 'Amazon', '1', ['9400111']],
  ]);
  assert.deepEqual(allocated, [[42]]);
  assert.equal(out.imported, 1);
  assert.equal(out.updated, 2);
  assert.equal(out.stats?.ambiguous, 1);
});

test('runSheetBackfill: a tab without the required titles is named, and no readable tab is a failure outcome', async () => {
  const { deps, ingested } = fakeDeps({ Sheet_09_28_2026: [['Order', 'Tracking Code'], ['1', '1Z']] });
  const out = await runSheetBackfill(ORG, deps, { now: NOW });
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /Sheet_09_28_2026: needs "Order Number" and "Tracking"/);
  assert.equal(ingested.length, 0);
});

test('runSheetBackfill: the import record stamps each written order with its sheet line and records every refused line', async () => {
  const detail = { productTitle: '', sku: '', itemNumber: '', tracking: '', titleSource: 'sheet' as const };
  const { deps } = fakeDeps(
    {
      Sheet_09_27_2026: [
        HEADER,
        ['', '111', 'I1', 'Widget', '1', 'S1', 'Used', '1Z999', '', 'eBay'],
        ['', '222', 'I2', 'Gadget', '1', 'S2', 'New', '', '', 'Amazon'],
      ],
      Sheet_09_28_2026: [
        HEADER,
        ['', '', 'I9', 'Stray', '1', 'S9', 'New', '1Z0', '', 'eBay'],
        ['', '111', 'I3', 'Widget part 2', '1', 'S3', 'Used', '1Z999', '', 'eBay'],
      ],
    },
    {
      inserted: [{ ...detail, orderId: '111', orderRowId: 42, accountSource: 'eBay', outcome: 'inserted', filledFields: [] }],
      ambiguous: [{ ...detail, orderId: '999', accountSource: 'Amazon', outcome: 'ambiguous', quarantineReason: 'ambiguous_match' }],
    },
  );
  const out = await runSheetBackfill(ORG, deps, { now: NOW });
  assert.deepEqual(
    out.importRows?.map((r) => [r.outcome, r.externalOrderId, r.orderRowId, r.platform, r.reason ?? null, r.sheetTab ?? null, r.sheetRow ?? null]),
    [
      ['inserted', '111', 42, 'ebay', null, 'Sheet_09_28_2026', 3],
      ['ambiguous', '999', null, 'amazon', 'ambiguous_match', null, null],
      ['skipped', '222', null, 'amazon', 'noTracking', 'Sheet_09_27_2026', 3],
    ],
    'an order on two tabs points at its line in the latest one; the numberless row is not a record',
  );
});
