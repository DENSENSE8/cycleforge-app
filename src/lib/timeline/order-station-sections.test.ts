import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TimelineItem } from './types';
import {
  countTimelineByStation,
  filterTimelineByStation,
  orderStationForPhotoSource,
  orderStationForTimelineItem,
  resolveDefaultOrderStationTab,
} from './order-station-sections';

function item(partial: Partial<TimelineItem> & { sourceEventType?: string }): TimelineItem {
  return {
    id: partial.id ?? '1',
    at: partial.at ?? '2026-08-01T12:00:00Z',
    title: partial.title ?? 'Event',
    sourceEventType: partial.sourceEventType,
    ...partial,
  };
}

describe('order-station-sections', () => {
  it('maps inventory + SAL + photo event types to stations', () => {
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'RECEIVED' })), 'receiving');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'TRIAGED' })), 'receiving');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'ARRIVAL_PHOTOS' })), 'receiving');

    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'UNBOX_PHOTOS' })), 'unbox');

    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'TEST_PASS' })), 'testing');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'TRACKING_SCANNED' })), 'testing');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'SERIAL_ADDED' })), 'testing');

    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'PACKED' })), 'shipping');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'SHIP_CONFIRM' })), 'shipping');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'PACK_PHOTOS' })), 'shipping');

    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'CARRIER_EVENT' })), 'more');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'THREAD_MESSAGE' })), 'more');
    assert.equal(orderStationForTimelineItem(item({ sourceEventType: 'PUTAWAY' })), 'more');
    assert.equal(orderStationForTimelineItem(item({})), 'more');
  });

  it('maps photo wire sources to stations', () => {
    assert.equal(orderStationForPhotoSource('arrival'), 'receiving');
    assert.equal(orderStationForPhotoSource('unbox_carton'), 'unbox');
    assert.equal(orderStationForPhotoSource('unbox_item'), 'unbox');
    assert.equal(orderStationForPhotoSource('testing'), 'testing');
    assert.equal(orderStationForPhotoSource('packing'), 'shipping');
  });

  it('filters and counts by station', () => {
    const items = [
      item({ id: 'a', sourceEventType: 'RECEIVED' }),
      item({ id: 'b', sourceEventType: 'TEST_PASS' }),
      item({ id: 'c', sourceEventType: 'PACKED' }),
      item({ id: 'd', sourceEventType: 'CARRIER_EVENT' }),
    ];
    assert.equal(filterTimelineByStation(items, 'testing').length, 1);
    assert.deepEqual(countTimelineByStation(items), {
      receiving: 1,
      unbox: 0,
      testing: 1,
      shipping: 1,
      more: 1,
    });
  });

  it('resolves default section packing-first (shipping before inbound)', () => {
    assert.equal(
      resolveDefaultOrderStationTab({
        counts: { receiving: 2, unbox: 2, testing: 1, shipping: 1, more: 3 },
      }),
      'shipping',
    );
    assert.equal(
      resolveDefaultOrderStationTab({
        counts: { receiving: 0, unbox: 2, testing: 1, shipping: 0, more: 3 },
      }),
      'testing',
    );
    assert.equal(
      resolveDefaultOrderStationTab({
        counts: { receiving: 0, unbox: 0, testing: 0, shipping: 0, more: 0 },
        hasPackedOrShippedStamp: true,
      }),
      'shipping',
    );
    assert.equal(
      resolveDefaultOrderStationTab({
        counts: { receiving: 0, unbox: 0, testing: 0, shipping: 0, more: 0 },
      }),
      'more',
    );
  });
});
