import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsv } from './parse-csv';

describe('parseCsv', () => {
  it('parses comma-separated headers and quoted commas', () => {
    const { headers, rows } = parseCsv('Order,SKU,Name\n"A,1",SKU1,"Doe, Jane"\n');
    assert.deepEqual(headers, ['Order', 'SKU', 'Name']);
    assert.equal(rows[0].Order, 'A,1');
    assert.equal(rows[0].Name, 'Doe, Jane');
  });

  it('parses Amazon Manage Returns tab-separated reports', () => {
    const text = [
      'Order ID\tASIN\tAmazon RMA ID\tTracking ID',
      '111-222-333\tB0EXAMPLE1\tRMA1\t1Z999AA10123456784',
    ].join('\n');
    const { headers, rows } = parseCsv(text);
    assert.deepEqual(headers, ['Order ID', 'ASIN', 'Amazon RMA ID', 'Tracking ID']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]['Order ID'], '111-222-333');
    assert.equal(rows[0]['Tracking ID'], '1Z999AA10123456784');
  });
});
