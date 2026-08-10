/**
 * Run: node --test --import tsx src/lib/receiving/history-export-csv.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RECEIVING_HISTORY_EXPORT_COLUMNS,
  buildReceivingHistoryExportCsv,
  buildReceivingHistoryExportRow,
  receivingHistoryExportFilename,
} from './history-export-csv';

describe('receiving history export CSV', () => {
  it('emits header only for an empty view', () => {
    const csv = buildReceivingHistoryExportCsv([]);
    assert.equal(csv, RECEIVING_HISTORY_EXPORT_COLUMNS.join(','));
  });

  it('title precedence is Zoho item → catalog → line name', () => {
    assert.equal(
      buildReceivingHistoryExportRow({
        zoho_item_title: 'Zoho title',
        catalog_product_title: 'Catalog title',
        item_name: 'Line name',
      })[2],
      'Zoho title',
    );
    assert.equal(
      buildReceivingHistoryExportRow({ item_name: 'Line name' })[2],
      'Line name',
    );
  });

  it('RFC-4180 quotes commas / quotes / newlines', () => {
    const csv = buildReceivingHistoryExportCsv([
      { zoho_item_title: 'Speaker, "Mini", v2', zoho_purchaseorder_number: 'PO-1' },
    ]);
    const dataLine = csv.split('\n')[1]!;
    assert.match(dataLine, /"Speaker, ""Mini"", v2"/);
    assert.ok(dataLine.startsWith('PO-1,'));
  });

  it('missing fields are honest empty cells, never "N/A"', () => {
    const row = buildReceivingHistoryExportRow({ sku: 'SKU-9' });
    assert.equal(row.length, RECEIVING_HISTORY_EXPORT_COLUMNS.length);
    // po, tracking empty; sku populated at index 3.
    assert.equal(row[0], '');
    assert.equal(row[3], 'SKU-9');
    assert.ok(row.every((cell) => cell !== 'N/A'));
  });

  it('qty received / expected are separate numeric columns', () => {
    const row = buildReceivingHistoryExportRow({
      quantity_received: 1,
      quantity_expected: 3,
    });
    assert.equal(row[5], '1');
    assert.equal(row[6], '3');
  });

  it('filename is the warehouse civil day', () => {
    assert.equal(receivingHistoryExportFilename('2026-08-09'), 'unbox-history-2026-08-09.csv');
  });
});
