import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recentLookupKey } from '@/components/labels/recent-lookup-key';
import {
  getLabelPrintStatusDot,
  getLabelPrintStatusDotLabel,
  labelPrintFeedToRailVM,
} from '@/components/labels/product-labels-rail-vm';
import type { LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';
import { parseLabelsView } from '@/components/labels/labels-view';

function feedItem(partial: Partial<LabelPrintFeedItem>): LabelPrintFeedItem {
  return {
    id: 1,
    printed_at: '2026-07-22T00:00:00.000Z',
    staff_id: null,
    staff_name: null,
    sku: 'SKU-1',
    sku_catalog_id: null,
    product_title: 'Widget',
    image_url: null,
    unit_id: 'U-1',
    gtin: null,
    symbology: null,
    serial_count: null,
    print_class: null,
    serial_unit_id: null,
    serial_number: null,
    current_status: null,
    current_location: null,
    ...partial,
  };
}

describe('parseLabelsView', () => {
  it('defaults to print and accepts recent/history', () => {
    assert.equal(parseLabelsView(null), 'print');
    assert.equal(parseLabelsView('recent'), 'recent');
    assert.equal(parseLabelsView('history'), 'history');
    assert.equal(parseLabelsView('nope'), 'print');
  });
});

describe('recentLookupKey', () => {
  it('prefers serial_unit_id, then serial, then unit_id', () => {
    assert.equal(recentLookupKey(feedItem({ serial_unit_id: 42, serial_number: 'SN', unit_id: 'U' })), '42');
    assert.equal(recentLookupKey(feedItem({ serial_number: 'SN', unit_id: 'U' })), 'SN');
    assert.equal(recentLookupKey(feedItem({ unit_id: 'U-9' })), 'U-9');
  });
});

describe('labelPrintFeedToRailVM', () => {
  it('titles from product then sku then unit', () => {
    const vm = labelPrintFeedToRailVM(feedItem({ product_title: 'Cam', sku: 'S', unit_id: 'U' }));
    assert.equal(vm.title, 'Cam');
    assert.equal(vm.titleAttr, 'Cam');
  });

  it('maps status to rail dots', () => {
    assert.equal(getLabelPrintStatusDot(feedItem({ current_status: 'STOCKED' })), 'bg-emerald-500');
    assert.equal(getLabelPrintStatusDot(feedItem({ current_status: null })), 'bg-emerald-500');
    assert.equal(getLabelPrintStatusDotLabel(feedItem({})), 'Label printed');
  });
});
