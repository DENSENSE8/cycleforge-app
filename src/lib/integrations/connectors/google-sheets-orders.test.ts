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
  const { rows, skips, rowsRead } = collectEligibleRows([
    { cols: colIndices, rows: [row('111', '1Z999'), row('FBA19KD6XX28', '1Z1'), row('', '1Z2'), row('222', ''), ['', '', '']] },
    { cols: colIndices, rows: [row('111', '1z999'), row('333', '9400')] },
  ]);
  assert.equal(rowsRead, 6, 'padding is not a read row');
  assert.deepEqual(skips, { fbaShipment: 1, noOrderId: 1, noTracking: 1, duplicate: 1 });
  assert.deepEqual(rows.map((r) => r.row[1]), ['111', '333']);
});

function fakeDeps(tabs: Record<string, unknown[][]>) {
  const ingested: CanonicalOrderLine[][] = [];
  const allocated: number[][] = [];
  const deps: SheetBackfillDeps = {
    listTabs: async () => Object.keys(tabs),
    readTabs: async (_org, titles) => titles.map((t) => tabs[t]),
    platformOf: async () => () => null,
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
        details: { inserted: [], updated: [], deleted: [], unknownTitle: [], unresolvedTracking: [], unmatchedCatalog: [] },
      } as IngestCanonicalOrdersResult;
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
