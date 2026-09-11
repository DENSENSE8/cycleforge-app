/**
 * FIND event adapters — titles, actor, identifier routing.
 *
 * Callers: node:test. Schema: StationActivityRow / FindEvent.
 * User: must see who packed/picked/scanned out and exact identifier routing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findEventsFromOrderAudit,
  findEventsFromPackLedger,
  findEventsFromPickSessions,
  findEventsFromStationActivity,
  presentOrderFindEvents,
} from './find-events-from-sources';
import type { OrderTimelinePayload } from '@/lib/queries/order-timeline-query';

describe('find events from sources', () => {
  it('maps SAL SHIP_CONFIRM to Scanned out with actor and tracking bind', () => {
    const [event] = findEventsFromStationActivity([
      {
        id: 1,
        created_at: '2026-09-10T18:00:00.000Z',
        station: 'OUTBOUND',
        activity_type: 'SHIP_CONFIRM',
        actor_name: 'Dock Kim',
        scan_ref: '9405508106244533289572',
        serial_number: null,
        metadata: null,
      },
    ]);
    assert.equal(event.title, 'Scanned out');
    assert.equal(event.actor, 'Dock Kim');
    assert.equal(event.bind?.tracking, '9405508106244533289572');
    assert.equal(event.bind?.serial, undefined);
  });

  it('maps SERIAL_ADDED to serial + source SKU, not scan_ref as serial', () => {
    const [event] = findEventsFromStationActivity([
      {
        id: 2,
        created_at: '2026-09-10T17:00:00.000Z',
        station: 'TECH',
        activity_type: 'SERIAL_ADDED',
        actor_name: 'Tech Pat',
        scan_ref: '01091-BK',
        serial_number: '078338982650888AE',
        metadata: { source_sku_code: '01091-BK' },
      },
    ]);
    assert.equal(event.title, 'Serial added');
    assert.equal(event.bind?.serial, '078338982650888AE');
    assert.equal(event.bind?.sku, '01091-BK');
    assert.equal(event.bind?.tracking, undefined);
  });

  it('maps TECH TRACKING_SCANNED to Picked with actor', () => {
    const [event] = findEventsFromStationActivity([
      {
        id: 5,
        created_at: '2026-09-10T16:00:00.000Z',
        station: 'TECH',
        activity_type: 'TRACKING_SCANNED',
        actor_name: 'Tech Pat',
        scan_ref: '9405508106244533289572',
        serial_number: null,
        metadata: null,
      },
    ]);
    assert.equal(event.title, 'Picked');
    assert.equal(event.actor, 'Tech Pat');
  });

  it('maps SERIAL_ADDED SKU_PULL to Picked', () => {
    const [event] = findEventsFromStationActivity([
      {
        id: 6,
        created_at: '2026-09-10T16:01:00.000Z',
        station: 'TECH',
        activity_type: 'SERIAL_ADDED',
        actor_name: 'Tech Pat',
        scan_ref: '01091-BK',
        serial_number: '078338982650888AE',
        metadata: { source_method: 'SKU_PULL', source_sku_code: '01091-BK' },
      },
    ]);
    assert.equal(event.title, 'Picked');
    assert.equal(event.actor, 'Tech Pat');
    assert.equal(event.bind?.sku, '01091-BK');
  });

  it('maps PACK_COMPLETED audit to Packed with actor', () => {
    const [event] = findEventsFromOrderAudit([
      {
        id: 3,
        created_at: '2026-09-10T16:00:00.000Z',
        action: 'PACK_COMPLETED',
        after_data: {},
        metadata: null,
        actor_name: 'Packer Lee',
      },
    ]);
    assert.equal(event.title, 'Packed');
    assert.equal(event.actor, 'Packer Lee');
  });

  it('adds completed pick sessions when inventory has no PICKED hop', () => {
    const empty: OrderTimelinePayload = {
      events: [],
      lifecycle: [],
      stationEvents: [],
      threadMessages: [],
      carrierEvents: [],
      rmaEvents: [],
      unitPhotos: [],
      pickSessions: [
        { id: 9, ended_at: '2026-09-10T15:00:00.000Z', actor_name: 'Picker Mo' },
      ],
      packEvents: [],
    };
    const events = presentOrderFindEvents(empty, {});
    const picked = events.find((row) => row.title === 'Picked');
    assert.ok(picked);
    assert.equal(picked?.actor, 'Picker Mo');
  });

  it('omits pick sessions when inventory already has PICKED', () => {
    const payload: OrderTimelinePayload = {
      events: [],
      lifecycle: [
        {
          id: 4,
          occurred_at: '2026-09-10T15:00:00.000Z',
          event_type: 'PICKED',
          actor_name: 'Picker Mo',
          serial_number: null,
          sku: null,
          prev_status: null,
          next_status: 'PICKED',
        },
      ],
      stationEvents: [],
      threadMessages: [],
      carrierEvents: [],
      rmaEvents: [],
      unitPhotos: [],
      pickSessions: [
        { id: 9, ended_at: '2026-09-10T15:01:00.000Z', actor_name: 'Picker Mo' },
      ],
      packEvents: [],
    };
    const events = presentOrderFindEvents(payload, {});
    assert.equal(events.filter((row) => row.id.startsWith('pick:')).length, 0);
    assert.equal(events.filter((row) => row.title === 'Picked').length, 1);
  });

  it('maps pick session rows to Picked hops', () => {
    const [event] = findEventsFromPickSessions([
      { id: 1, ended_at: '2026-09-10T15:00:00.000Z', actor_name: 'Picker Mo' },
    ]);
    assert.equal(event.title, 'Picked');
    assert.equal(event.actor, 'Picker Mo');
  });

  it('maps PACK_SCAN ledger rows to Packed with actor and tracking', () => {
    const [event] = findEventsFromPackLedger([
      {
        id: 8,
        created_at: '2026-09-10T16:30:00.000Z',
        station: 'PACK',
        activity_type: 'PACK_SCAN',
        actor_name: 'Packer Lee',
        scan_ref: '876885847990',
        serial_number: null,
        metadata: null,
      },
    ]);
    assert.equal(event.title, 'Packed');
    assert.equal(event.actor, 'Packer Lee');
    assert.equal(event.bind?.tracking, '876885847990');
  });
});
