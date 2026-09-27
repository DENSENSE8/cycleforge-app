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
  findEventsFromOrderNotes,
  findEventsFromSignals,
  findEventsFromPackLedger,
  findEventsFromPickSessions,
  findEventsFromReceivingPhotos,
  findEventsFromStationActivity,
  findEventsFromThreadMessages,
  presentCartonFindEvents,
  presentOrderFindEvents,
} from './find-events-from-sources';
import type { ReceivingPhotoRow } from '@/hooks/useReceivingPhotos';
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

  it('maps PICK PICK_SCANNED to Picked with actor and tracking bind', () => {
    const [event] = findEventsFromStationActivity([
      {
        id: 5,
        created_at: '2026-09-10T16:00:00.000Z',
        station: 'PICK',
        activity_type: 'PICK_SCANNED',
        actor_name: 'Picker Pat',
        scan_ref: '9405508106244533289572',
        serial_number: null,
        metadata: null,
      },
    ]);
    assert.equal(event.title, 'Picked');
    assert.equal(event.actor, 'Picker Pat');
    assert.equal(event.bind?.tracking, '9405508106244533289572');
  });

  it('does not call an FBA tracking scan (TRACKING_SCANNED) a pick', () => {
    const [event] = findEventsFromStationActivity([
      {
        id: 7,
        created_at: '2026-09-10T16:02:00.000Z',
        station: 'FBA',
        activity_type: 'TRACKING_SCANNED',
        actor_name: 'Prep Sam',
        scan_ref: '9405508106244533289572',
        serial_number: null,
        metadata: null,
      },
    ]);
    assert.notEqual(event.title, 'Picked');
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

  it('groups carton photos by stage into evidence events, newest-first, unclassified folded', () => {
    const rows: ReceivingPhotoRow[] = [
      { id: 1, receivingId: 52171, receivingLineId: null, photoUrl: 'https://x/a.jpg', caption: 'receiving_package', photoType: 'receiving_package', createdAt: '2026-09-04T10:00:00.000Z' },
      { id: 2, receivingId: 52171, receivingLineId: null, photoUrl: 'https://x/b.jpg', caption: 'receiving_package', photoType: 'receiving_package', createdAt: '2026-09-04T11:00:00.000Z' },
      { id: 3, receivingId: 52171, receivingLineId: 9, photoUrl: 'https://x/c.jpg', caption: null, photoType: 'receiving_item', createdAt: '2026-09-04T12:00:00.000Z' },
      { id: 4, receivingId: 52171, receivingLineId: null, photoUrl: 'https://x/d.jpg', caption: 'custom-thing', photoType: 'custom-thing', createdAt: '2026-09-04T13:00:00.000Z' },
      { id: 5, receivingId: 52171, receivingLineId: null, photoUrl: '   ', caption: null, photoType: null, createdAt: '2026-09-04T14:00:00.000Z' },
    ];
    const events = findEventsFromReceivingPhotos(rows);
    assert.ok(events.every((e) => e.kind === 'evidence'));
    const arrival = events.find((e) => e.id === 'evidence:carton:arrival_package');
    assert.ok(arrival);
    assert.equal(arrival.at, '2026-09-04T11:00:00.000Z');
    assert.deepEqual(arrival.evidenceUrls, ['https://x/b.jpg', 'https://x/a.jpg']);
    assert.equal(arrival.body, '2 photos');
    assert.ok(events.some((e) => e.id === 'evidence:carton:unbox_item'));
    const other = events.find((e) => e.id === 'evidence:carton:unclassified');
    assert.ok(other);
    assert.equal(other.title, 'Photos');
    assert.deepEqual(other.evidenceUrls, ['https://x/d.jpg']);
    assert.equal(findEventsFromReceivingPhotos([]).length, 0);
  });

  it('carton stream carries evidence when photos exist and omits it when none', () => {
    const base = { events: [], totals: { expected: 1, received: 1 } as never, createdAt: '2026-09-01T00:00:00.000Z' };
    const withPhotos = presentCartonFindEvents({
      ...base,
      photos: [{ id: 1, receivingId: 1, receivingLineId: null, photoUrl: 'https://x/a.jpg', caption: null, photoType: 'receiving_unbox_carton', createdAt: '2026-09-02T00:00:00.000Z' }],
    });
    assert.ok(withPhotos.some((e) => e.kind === 'evidence'));
    assert.ok(!presentCartonFindEvents(base).some((e) => e.kind === 'evidence'));
  });

  it('maps thread messages to note faces, naming an internal note and a public reply apart', () => {
    const events = findEventsFromThreadMessages([
      {
        id: 7,
        visibility: 'internal',
        provider: 'internal',
        body: '  Box   arrived crushed\n on the left corner ',
        createdAt: '2026-09-09T10:00:00.000Z',
        authorName: 'Riley',
      },
      {
        id: 8,
        visibility: 'public',
        provider: 'zendesk',
        body: 'Replacement is on the way.',
        createdAt: '2026-09-10T10:00:00.000Z',
        authorName: null,
      },
    ]);
    assert.equal(events.length, 2);
    assert.ok(events.every((e) => e.kind === 'note'));
    const [note, reply] = events;
    assert.equal(note.id, 'thread:7');
    assert.equal(note.title, 'Note');
    // Whitespace is flattened so a pasted multi-line note stays one stream row.
    assert.equal(note.body, 'Box arrived crushed on the left corner');
    assert.equal(note.actor, 'Riley');
    assert.equal(reply.title, 'Reply');
    // Never invent an author: an unattributed row must omit the field.
    assert.equal(reply.actor, undefined);
  });

  it('drops thread rows that cannot be placed in time or carry no words', () => {
    const events = findEventsFromThreadMessages([
      { id: 1, visibility: 'internal', provider: 'internal', body: 'kept', createdAt: '2026-09-09T10:00:00.000Z' },
      { id: 2, visibility: 'internal', provider: 'internal', body: 'no stamp', createdAt: null },
      { id: 3, visibility: 'internal', provider: 'internal', body: '   ', createdAt: '2026-09-09T10:00:00.000Z' },
    ]);
    assert.deepEqual(events.map((e) => e.id), ['thread:1']);
  });

  it('truncates a long note to a preview — FIND confirms, it does not render a conversation', () => {
    const [event] = findEventsFromThreadMessages([
      {
        id: 9,
        visibility: 'internal',
        provider: 'internal',
        body: 'x'.repeat(400),
        createdAt: '2026-09-09T10:00:00.000Z',
      },
    ]);
    assert.equal(event.body?.length, 140);
    assert.ok(event.body?.endsWith('…'));
  });

  it('order stream carries thread notes when they exist and omits the kind when none', () => {
    const base = {
      events: [],
      lifecycle: [],
      stationEvents: [],
      threadMessages: [],
      carrierEvents: [],
      rmaEvents: [],
      unitPhotos: [],
      pickSessions: [],
      packEvents: [],
    } satisfies OrderTimelinePayload;
    const withNote = presentOrderFindEvents(
      {
        ...base,
        threadMessages: [
          {
            id: 4,
            visibility: 'internal',
            provider: 'internal',
            body: 'Customer called about the serial',
            createdAt: '2026-09-08T10:00:00.000Z',
            authorName: 'Sam',
          },
        ],
      },
      {},
    );
    assert.ok(withNote.some((e) => e.kind === 'note' && e.id === 'thread:4'));
    assert.ok(!presentOrderFindEvents(base, {}).some((e) => e.kind === 'note'));
  });

  it('a RETURNED after a SHIPPED is a hop (round trip), not an exception', () => {
    const base = {
      events: [], stationEvents: [], threadMessages: [], carrierEvents: [],
      rmaEvents: [], unitPhotos: [], pickSessions: [], packEvents: [],
    };
    const events = presentOrderFindEvents(
      {
        ...base,
        lifecycle: [
          { id: 1, occurred_at: '2026-09-01T00:00:00.000Z', event_type: 'SHIPPED' },
          { id: 2, occurred_at: '2026-09-09T00:00:00.000Z', event_type: 'RETURNED' },
        ],
      } as never,
      {},
    );
    const returned = events.find((e) => e.id === 'inv:2');
    assert.equal(returned?.kind, 'hop', 'the return leg closes the loop');
    assert.equal(returned?.title, 'Round trip');
    // Re-kinded in place — never a second event for the same return.
    assert.equal(events.filter((e) => e.id === 'inv:2').length, 1);
    // The outbound scan stays custody; only the return changes face.
    assert.equal(events.find((e) => e.id === 'inv:1')?.kind, 'custody');
  });

  it('a RETURNED with no prior SHIPPED is an inbound return, never a hop', () => {
    const base = {
      events: [], stationEvents: [], threadMessages: [], carrierEvents: [],
      rmaEvents: [], unitPhotos: [], pickSessions: [], packEvents: [],
    };
    const events = presentOrderFindEvents(
      {
        ...base,
        lifecycle: [
          { id: 7, occurred_at: '2026-09-09T00:00:00.000Z', event_type: 'RETURNED' },
        ],
      } as never,
      {},
    );
    assert.equal(events.find((e) => e.id === 'inv:7')?.kind, 'exception');
    assert.equal(events.some((e) => e.kind === 'hop'), false, 'no ship leg, no Hops chip');
  });

  it('ordering decides the loop: a RETURNED before the SHIPPED does not count', () => {
    const base = {
      events: [], stationEvents: [], threadMessages: [], carrierEvents: [],
      rmaEvents: [], unitPhotos: [], pickSessions: [], packEvents: [],
    };
    const events = presentOrderFindEvents(
      {
        ...base,
        lifecycle: [
          { id: 3, occurred_at: '2026-09-09T00:00:00.000Z', event_type: 'SHIPPED' },
          { id: 4, occurred_at: '2026-09-01T00:00:00.000Z', event_type: 'RETURNED' },
        ],
      } as never,
      {},
    );
    assert.equal(events.find((e) => e.id === 'inv:4')?.kind, 'exception');
    assert.equal(events.some((e) => e.kind === 'hop'), false);
  });

  it('maps order_notes rows to note faces with author and stamp', () => {
    const events = findEventsFromOrderNotes([
      {
        id: 11,
        noteText: '  Buyer wants\n the blue one  ',
        createdAt: '2026-09-05T10:00:00.000Z',
        authorName: 'Dana',
      },
      { id: 12, noteText: '   ', createdAt: '2026-09-06T10:00:00.000Z' },
      { id: 13, noteText: 'no stamp', createdAt: null },
    ]);
    assert.deepEqual(events.map((e) => e.id), ['ordernote:11']);
    assert.equal(events[0].kind, 'note');
    assert.equal(events[0].title, 'Note');
    assert.equal(events[0].body, 'Buyer wants the blue one');
    assert.equal(events[0].actor, 'Dana');
  });

  it('maps entity_signals to exception faces titled by reason code', () => {
    const events = findEventsFromSignals([
      {
        id: 21,
        signalKind: 'exception_why',
        reasonCode: 'DAMAGED_IN_TRANSIT',
        severity: 3,
        notes: 'Corner crushed',
        occurredAt: '2026-09-07T10:00:00.000Z',
      },
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'exception');
    // The floor says the reason code, so it is the title.
    assert.equal(events[0].title, 'Damaged in transit');
    assert.equal(events[0].body, 'Corner crushed');
    // `severity` is a legend-less SMALLINT — never painted as a bare number.
    assert.ok(!String(events[0].body).includes('3'));
    // A signal records an observation, never a resolution FIND cannot prove.
    assert.equal(events[0].resolved, undefined);
  });

  it('falls back to the signal kind when no reason code was recorded', () => {
    const [event] = findEventsFromSignals([
      {
        id: 22,
        signalKind: 'test_fail_reason',
        reasonCode: null,
        severity: null,
        notes: null,
        occurredAt: '2026-09-07T10:00:00.000Z',
      },
    ]);
    assert.equal(event.title, 'Test fail reason');
    assert.equal(event.body, undefined);
  });

  it('order stream carries notes and signals when present, omits them when not', () => {
    const base = {
      events: [], lifecycle: [], stationEvents: [], threadMessages: [],
      carrierEvents: [], rmaEvents: [], unitPhotos: [], pickSessions: [],
      packEvents: [], orderNotes: [], signals: [],
    } satisfies OrderTimelinePayload;
    const rich = presentOrderFindEvents(
      {
        ...base,
        orderNotes: [{ id: 1, noteText: 'held for parts', createdAt: '2026-09-08T00:00:00.000Z' }],
        signals: [{
          id: 2, signalKind: 'exception_why', reasonCode: 'SHORT_SHIP',
          severity: null, notes: null, occurredAt: '2026-09-08T01:00:00.000Z',
        }],
      },
      {},
    );
    assert.ok(rich.some((e) => e.id === 'ordernote:1' && e.kind === 'note'));
    assert.ok(rich.some((e) => e.id === 'signal:2' && e.kind === 'exception'));
    const bare = presentOrderFindEvents(base, {});
    assert.equal(bare.some((e) => e.kind === 'note' || e.kind === 'exception'), false);
  });
});
