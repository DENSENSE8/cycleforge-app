import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeSupportContextTimeline,
  ticketLinkEventsToTimeline,
} from './support-context-timeline';

test('ticketLinkEventsToTimeline maps linked/unlinked rows', () => {
  const items = ticketLinkEventsToTimeline([
    {
      id: 1,
      at: '2026-07-15T12:00:00Z',
      kind: 'linked',
      ticketLabel: '#4821',
      actorName: 'Riley',
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Ticket linked');
  assert.equal(items[0].subtitle, '#4821');
  assert.equal(items[0].tone, 'success');
});

test('mergeSupportContextTimeline sorts newest-first across spines', () => {
  const items = mergeSupportContextTimeline({
    opsEvents: [
      {
        id: 10,
        occurred_at: '2026-07-15T10:00:00Z',
        event_type: 'TRACKING_SCANNED',
        entity_type: 'receiving',
        entity_id: 88,
      },
    ],
    ticketLinks: [
      {
        id: 2,
        at: '2026-07-15T12:00:00Z',
        kind: 'linked',
        ticketLabel: '#4821',
      },
    ],
    threadMessages: [
      {
        id: 3,
        visibility: 'internal',
        provider: 'internal',
        body: 'Waiting on photos',
        createdAt: '2026-07-15T11:00:00Z',
        authorName: 'Sam',
      },
    ],
  });
  assert.ok(items.length >= 3);
  assert.equal(items[0].title, 'Ticket linked');
  assert.equal(items[1].title, 'Note');
  assert.equal(items[2].title, 'Tracking scanned');
});
