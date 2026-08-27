import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  autoMapCsvInboundReturnsHeaders,
  classifyCsvInboundReturnsStagingRow,
  projectCsvInboundReturnsRow,
  toInboundImportCsvRecord,
} from '@/lib/inbound/csv-inbound-returns-import';
import { deskRowFromCsvRecord } from '@/lib/inbound/desk-csv';

describe('csv-inbound-returns-import', () => {
  it('auto-maps Amazon Manage Returns headers', () => {
    const mapping = autoMapCsvInboundReturnsHeaders([
      'Order ID',
      'ASIN',
      'Merchant SKU',
      'Item Name',
      'Return quantity',
      'Tracking ID',
      'Amazon RMA ID',
      'Return Reason',
      'Return carrier',
      'Return request status',
    ]);
    assert.equal(mapping.order_id, 'Order ID');
    assert.equal(mapping.asin, 'ASIN');
    assert.equal(mapping.sku, 'Merchant SKU');
    assert.equal(mapping.tracking_number, 'Tracking ID');
    assert.equal(mapping.rma_id, 'Amazon RMA ID');
    assert.equal(mapping.return_status, 'Return request status');
  });

  it('classifies cancelled as action_required', () => {
    const mapping = autoMapCsvInboundReturnsHeaders([
      'Order ID',
      'ASIN',
      'Return request status',
    ]);
    const row = {
      'Order ID': '111-222',
      ASIN: 'B00TEST',
      'Return request status': 'Cancelled',
    };
    const c = classifyCsvInboundReturnsStagingRow(row, mapping);
    assert.equal(c.status, 'action_required');
    assert.ok(c.missing.includes('return_status'));
  });

  it('classifies ready when order + ASIN present', () => {
    const mapping = autoMapCsvInboundReturnsHeaders([
      'Order ID',
      'ASIN',
      'Tracking ID',
      'Return request status',
    ]);
    const row = {
      'Order ID': '111-222',
      ASIN: 'B00TEST',
      'Tracking ID': 'TBA123',
      'Return request status': 'Approved',
    };
    const c = classifyCsvInboundReturnsStagingRow(row, mapping);
    assert.equal(c.status, 'ready');
    assert.deepEqual(c.missing, []);
  });

  it('projects and rebuilds a desk-ingestable Amazon record', () => {
    const mapping = autoMapCsvInboundReturnsHeaders([
      'Order ID',
      'ASIN',
      'Merchant SKU',
      'Item Name',
      'Tracking ID',
      'Amazon RMA ID',
      'Return Reason',
      'Return request status',
    ]);
    const row = {
      'Order ID': '111-2223333-4445555',
      ASIN: 'B00ASINTEST',
      'Merchant SKU': 'SKU-1',
      'Item Name': 'Widget',
      'Tracking ID': 'TBA999888777',
      'Amazon RMA ID': 'RMA-1',
      'Return Reason': 'Damaged',
      'Return request status': 'Approved',
    };
    const projected = projectCsvInboundReturnsRow(row, mapping);
    assert.equal(projected.order_id, '111-2223333-4445555');
    assert.equal(projected.tracking_number, 'TBA999888777');

    const rebuilt = toInboundImportCsvRecord(row, mapping);
    const desk = deskRowFromCsvRecord(rebuilt);
    assert.equal(desk.kind, 'return');
    assert.equal(desk.orderId, '111-2223333-4445555');
    assert.equal(desk.amazonAsin, 'B00ASINTEST');
    assert.equal(desk.trackingNumber, 'TBA999888777');
    assert.equal(desk.rmaId, 'RMA-1');
    assert.equal(desk.returnReason, 'Damaged');
    assert.equal(desk.skipReason, null);
  });
});
