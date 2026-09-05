import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { autoMapCsvOrderHeaders } from '@/lib/orders/csv-order-import';
import {
  classifyPastedText,
  EXTRACTED_ORDER_FIELDS,
  extractedOrderHeaders,
  pasteDraftFileName,
  stagingRowsFromExtractedOrders,
  type ExtractedOrderRow,
} from './paste-intake';

const ROW: ExtractedOrderRow = {
  orderNumber: '112-1234567-1234567',
  platform: 'amazon',
  itemTitle: 'Bose SoundLink Flex',
  itemNumber: 'B09CDH6DT4',
  sku: '',
  quantity: '1',
  customerName: 'J. Doe',
  shipByDate: '09/05/2026',
  trackingNumber: '',
};

describe('classifyPastedText', () => {
  test('a single line is prose, even with commas', () => {
    assert.deepEqual(classifyPastedText('show me orders, picks and packers'), { kind: 'prose' });
  });

  test('multi-line prose with commas does not bind and stays prose', () => {
    const text = 'show me orders, picks and packers\nthen the ones due today, please';
    assert.deepEqual(classifyPastedText(text), { kind: 'prose' });
  });

  test('a comma CSV with an order-number header is csv', () => {
    const text = 'Order ID,SKU,Quantity\n04-12345-67890,ABC-1,2\n04-12345-67891,ABC-2,1';
    const out = classifyPastedText(text);
    assert.equal(out.kind, 'csv');
    if (out.kind !== 'csv') return;
    assert.deepEqual(out.headers, ['Order ID', 'SKU', 'Quantity']);
    assert.equal(out.rows.length, 2);
    assert.equal(out.rows[0]!['Order ID'], '04-12345-67890');
  });

  test('a tab-separated Seller Central paste is csv', () => {
    const text = 'order-id\tsku\tquantity-purchased\n112-1-1\tSKU9\t1';
    const out = classifyPastedText(text);
    assert.equal(out.kind, 'csv');
  });

  test('two canonical columns without an order number still bind', () => {
    const text = 'SKU,Quantity\nA,1\nB,2';
    assert.equal(classifyPastedText(text).kind, 'csv');
  });

  test('a header row with a sentence-length cell is prose', () => {
    const long = 'a'.repeat(61);
    const text = `Order ID,${long}\n1,2`;
    assert.equal(classifyPastedText(text).kind, 'prose');
  });

  test('empty and whitespace are prose', () => {
    assert.equal(classifyPastedText('').kind, 'prose');
    assert.equal(classifyPastedText('   \n  ').kind, 'prose');
  });
});

describe('stagingRowsFromExtractedOrders', () => {
  test('headers are the canonical labels and autoMap binds every one', () => {
    const headers = extractedOrderHeaders();
    assert.equal(headers.length, EXTRACTED_ORDER_FIELDS.length);
    const mapping = autoMapCsvOrderHeaders(headers);
    for (const key of EXTRACTED_ORDER_FIELDS) {
      assert.ok(mapping[key], `${key} must bind through the alias map`);
    }
  });

  test('rows are keyed by label, trimmed, and blanks stay blank', () => {
    const { headers, rows } = stagingRowsFromExtractedOrders([
      { ...ROW, itemTitle: '  Bose SoundLink Flex  ' },
    ]);
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    for (const h of headers) assert.ok(h in row, `row carries ${h}`);
    assert.equal(row['Order number'], ROW.orderNumber);
    assert.equal(row['Item title'], 'Bose SoundLink Flex');
    assert.equal(row['Item number'], ROW.itemNumber);
    assert.equal(row['SKU'], '');
    assert.equal(row['Tracking number'], '');
  });

  test('an empty capture yields no rows (the loader refuses it)', () => {
    const { rows } = stagingRowsFromExtractedOrders([]);
    assert.equal(rows.length, 0);
  });
});

describe('pasteDraftFileName', () => {
  test('names the source and the count', () => {
    assert.equal(pasteDraftFileName('csv', 12), 'Pasted CSV');
    assert.equal(pasteDraftFileName('capture', 1), 'Screenshot · 1 order');
    assert.equal(pasteDraftFileName('capture', 3), 'Screenshot · 3 orders');
  });
});
