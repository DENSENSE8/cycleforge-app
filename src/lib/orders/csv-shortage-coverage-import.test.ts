/**
 * Shortage-coverage CSV auto-map + classify — Bose Amazon OOS sheet.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  autoMapCsvShortageCoverageHeaders,
  classifyCsvShortageCoverageRow,
  formatProjectedShortageCoverage,
  projectCsvShortageCoverageRow,
} from './csv-shortage-coverage-import';

const BOSE_HEADERS = [
  'Order ID',
  'Order Date',
  'Ship by Date',
  'Late',
  'Product Name',
  'Qty',
  'Order Total',
  'Reason OOS',
  'Status',
  'TRK Link for item',
  'Estimate Delivery Date',
  'Note',
];

const BOSE_ROW: Record<string, string> = {
  'Order ID': '113-1679301-5337863',
  'Order Date': '8/20/2026',
  'Ship by Date': '8/28/2026',
  Late: '5',
  'Product Name': 'Bose TV Speaker - Bluetooth, HDMI ARC',
  Qty: '1',
  'Order Total': '',
  'Reason OOS': '',
  Status: '',
  'TRK Link for item': '9261290983197850083534',
  'Estimate Delivery Date': 'Tracking Not Available',
  Note: '',
};

describe('autoMapCsvShortageCoverageHeaders', () => {
  it('maps the Amazon OOS sheet; Late is not ETA; TRK is inbound', () => {
    const mapping = autoMapCsvShortageCoverageHeaders(BOSE_HEADERS);
    assert.equal(mapping.order_number, 'Order ID');
    assert.equal(mapping.item_title, 'Product Name');
    assert.equal(mapping.short_qty, 'Qty');
    assert.equal(mapping.ship_by_date, 'Ship by Date');
    assert.equal(mapping.inbound_tracking, 'TRK Link for item');
    assert.equal(mapping.eta, 'Estimate Delivery Date');
    assert.equal(mapping.late, undefined);
    assert.notEqual(mapping.eta, 'Late');
  });
});

describe('classifyCsvShortageCoverageRow', () => {
  it('Bose row is Ready — title names the product, qty is 1, coverage optional', () => {
    const mapping = autoMapCsvShortageCoverageHeaders(BOSE_HEADERS);
    const { status, missing } = classifyCsvShortageCoverageRow(BOSE_ROW, mapping);
    assert.equal(status, 'ready');
    assert.deepEqual(missing, []);
  });

  it('missing order number or qty is Action required', () => {
    const mapping = autoMapCsvShortageCoverageHeaders(BOSE_HEADERS);
    const noOrder = classifyCsvShortageCoverageRow({ ...BOSE_ROW, 'Order ID': '' }, mapping);
    assert.equal(noOrder.status, 'action_required');
    assert.ok(noOrder.missing.includes('order_number'));

    const badQty = classifyCsvShortageCoverageRow({ ...BOSE_ROW, Qty: '0' }, mapping);
    assert.equal(badQty.status, 'action_required');
    assert.ok(badQty.missing.includes('short_qty'));
  });

  it('title-less row without SKU/ASIN is Action required', () => {
    const mapping = autoMapCsvShortageCoverageHeaders(BOSE_HEADERS);
    const bare = classifyCsvShortageCoverageRow({ ...BOSE_ROW, 'Product Name': '' }, mapping);
    assert.equal(bare.status, 'action_required');
    assert.ok(bare.missing.includes('item_title'));
  });
});

describe('formatProjectedShortageCoverage', () => {
  it('Bose inbound TRK with Tracking-Not-Available ETA is Awaiting inbound', () => {
    const mapping = autoMapCsvShortageCoverageHeaders(BOSE_HEADERS);
    const projected = projectCsvShortageCoverageRow(BOSE_ROW, mapping);
    assert.equal(formatProjectedShortageCoverage(projected), 'Awaiting inbound');
    assert.equal(projected.inbound_tracking, '9261290983197850083534');
    assert.equal(projected.eta, 'Tracking Not Available');
  });
});
