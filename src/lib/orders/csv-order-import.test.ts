import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCsvOrderCanonicalEdits,
  autoMapCsvOrderHeaders,
  classifyCsvOrderStagingRow,
  parseCsv,
  projectCsvOrderRow,
} from '@/lib/orders/csv-order-import';

describe('parseCsv', () => {
  it('parses headers and rows with quoted commas', () => {
    const text = 'Order,SKU,Name\n"A,1",SKU1,"Doe, Jane"\nB2,SKU2,Bob\n';
    const { headers, rows } = parseCsv(text);
    assert.deepEqual(headers, ['Order', 'SKU', 'Name']);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Order, 'A,1');
    assert.equal(rows[0].Name, 'Doe, Jane');
    assert.equal(rows[1].SKU, 'SKU2');
  });

  it('returns empty for blank input', () => {
    assert.deepEqual(parseCsv(''), { headers: [], rows: [] });
  });
});

describe('autoMapCsvOrderHeaders', () => {
  it('maps common aliases', () => {
    const mapping = autoMapCsvOrderHeaders([
      'Order ID',
      'Item Number',
      'Qty',
      'Buyer',
      'Tracking',
      'Channel',
    ]);
    assert.equal(mapping.order_number, 'Order ID');
    assert.equal(mapping.sku, 'Item Number');
    assert.equal(mapping.quantity, 'Qty');
    assert.equal(mapping.customer_name, 'Buyer');
    assert.equal(mapping.tracking_number, 'Tracking');
    assert.equal(mapping.platform, 'Channel');
  });
});

describe('classifyCsvOrderStagingRow', () => {
  const mapping = { order_number: 'Order', sku: 'SKU' };

  it('marks ready when order number and mapped SKU are present', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: 'S1' },
      mapping,
    );
    assert.equal(status, 'ready');
    assert.deepEqual(missing, []);
  });

  it('requires order number', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: '', SKU: 'S1' },
      mapping,
    );
    assert.equal(status, 'action_required');
    assert.ok(missing.includes('order_number'));
  });

  it('requires SKU only when SKU column is mapped', () => {
    const blankSku = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '' },
      mapping,
    );
    assert.equal(blankSku.status, 'action_required');
    assert.ok(blankSku.missing.includes('sku'));

    const noSkuMap = classifyCsvOrderStagingRow(
      { Order: 'O1' },
      { order_number: 'Order' },
    );
    assert.equal(noSkuMap.status, 'ready');
  });
});

describe('project + apply edits', () => {
  it('round-trips canonical edits onto raw headers', () => {
    const mapping = { order_number: 'Order', sku: 'SKU' };
    const row = { Order: 'O1', SKU: '' };
    const projected = projectCsvOrderRow(row, mapping);
    assert.equal(projected.order_number, 'O1');
    assert.equal(projected.sku, '');

    const next = applyCsvOrderCanonicalEdits(row, mapping, { sku: ' FIXED ' });
    assert.equal(next.SKU, 'FIXED');
    assert.equal(classifyCsvOrderStagingRow(next, mapping).status, 'ready');
  });
});
