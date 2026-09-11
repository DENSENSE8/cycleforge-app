/**
 * FIND case-file model — outline omit-zeros, newest-first, tracking is not a sel type.
 *
 * Callers: node:test runner only. No HTTP API. No DB schema.
 * User: start Session A / Phase 0 (law, model, guards; no paint).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUiEntityType } from '@/lib/search/search-hit';
import { parseSearchSel } from '@/lib/search/search-selection';
import {
  FIND_EVENT_KINDS,
  adapterOutline,
  eventsNewestFirst,
  filterEventsByKind,
  isFindEventKind,
  outlineFromEvents,
  presentFindDossier,
  type FindEvent,
} from './find-dossier-model';

function ev(
  partial: Pick<FindEvent, 'id' | 'kind' | 'at'> & Partial<FindEvent>,
): FindEvent {
  return { title: partial.kind, ...partial };
}

describe('FIND event kinds', () => {
  it('is the locked catalog — no station names, no tracking entity', () => {
    assert.deepEqual([...FIND_EVENT_KINDS], [
      'status',
      'qty',
      'hop',
      'evidence',
      'exception',
      'bind',
      'carrier',
      'note',
    ]);
    for (const banned of ['tracking', 'unbox', 'pack', 'support', 'displays']) {
      assert.equal(isFindEventKind(banned), false);
    }
    assert.equal(isFindEventKind('carrier'), true);
  });
});

describe('tracking paste is not a FIND entity type', () => {
  it('parseSearchSel refuses tracking:…', () => {
    assert.equal(parseSearchSel('tracking:9405508106244533289572'), null);
    assert.equal(isUiEntityType('tracking'), false);
  });

  it('sel vocabulary stays the six confirmation types', () => {
    assert.deepEqual(parseSearchSel('order:13924'), { entityType: 'order', id: 13924 });
    assert.ok(isUiEntityType('order'));
    assert.ok(isUiEntityType('unit'));
    assert.ok(isUiEntityType('receiving'));
    assert.ok(isUiEntityType('sku'));
    assert.ok(isUiEntityType('repair'));
    assert.ok(isUiEntityType('fba'));
  });
});

describe('outlineFromEvents', () => {
  it('omits kinds with count 0 and keeps catalog order', () => {
    const events = [
      ev({ id: 'h', kind: 'hop', at: '2026-09-01T00:00:00.000Z' }),
      ev({
        id: 'c',
        kind: 'carrier',
        at: '2026-09-02T00:00:00.000Z',
        children: [ev({ id: 'c1', kind: 'hop', at: '2026-09-02T01:00:00.000Z' })],
      }),
      ev({ id: 'q', kind: 'qty', at: '2026-08-01T00:00:00.000Z' }),
    ];
    assert.deepEqual(outlineFromEvents(events), [
      { kind: 'qty', count: 1 },
      { kind: 'hop', count: 2 },
      { kind: 'carrier', count: 1 },
    ]);
  });

  it('empty stream yields an empty outline', () => {
    assert.deepEqual(outlineFromEvents([]), []);
  });
});

describe('adapterOutline', () => {
  it('omits zero counts and does not invent hops', () => {
    assert.deepEqual(adapterOutline({ status: 1, hop: 0, qty: 2 }), [
      { kind: 'status', count: 1 },
      { kind: 'qty', count: 2 },
    ]);
  });
});

describe('eventsNewestFirst', () => {
  it('sorts newest-first without dropping children', () => {
    const events = [
      ev({ id: 'old', kind: 'note', at: '2026-01-01T00:00:00.000Z' }),
      ev({ id: 'new', kind: 'hop', at: '2026-09-10T00:00:00.000Z' }),
      ev({ id: 'mid', kind: 'bind', at: '2026-06-01T00:00:00.000Z' }),
    ];
    assert.deepEqual(
      eventsNewestFirst(events).map((e) => e.id),
      ['new', 'mid', 'old'],
    );
  });
});

describe('presentFindDossier', () => {
  it('fills outline from the sorted stream', () => {
    const dossier = presentFindDossier({
      entityType: 'order',
      id: 13924,
      title: '113-1397006-0292212',
      status: 'Shipped',
      facts: [{ id: 'status', label: 'Status', value: 'Shipped' }],
      findings: [],
      handoffs: [{ href: '/shipping/orders?open=13924', label: 'Open on To-ship', primary: true }],
      events: [
        ev({ id: 'older', kind: 'qty', at: '2026-01-01T00:00:00.000Z' }),
        ev({ id: 'newer', kind: 'evidence', at: '2026-09-01T00:00:00.000Z' }),
      ],
    });
    assert.deepEqual(
      dossier.events.map((e) => e.id),
      ['newer', 'older'],
    );
    assert.deepEqual(dossier.outline, [
      { kind: 'qty', count: 1 },
      { kind: 'evidence', count: 1 },
    ]);
    assert.equal(filterEventsByKind(dossier.events, 'qty')[0]?.id, 'older');
    assert.equal(filterEventsByKind(dossier.events, null).length, 2);
  });
});

describe('filterEventsByKind', () => {
  it('lifts nested hops when the filter is hop', () => {
    const events = [
      ev({
        id: 'c',
        kind: 'carrier',
        at: '2026-09-02T00:00:00.000Z',
        children: [ev({ id: 'c1', kind: 'hop', at: '2026-09-02T01:00:00.000Z' })],
      }),
      ev({ id: 'h', kind: 'hop', at: '2026-09-01T00:00:00.000Z' }),
    ];
    assert.deepEqual(
      filterEventsByKind(events, 'hop').map((e) => e.id),
      ['c1', 'h'],
    );
    assert.deepEqual(
      filterEventsByKind(events, 'carrier').map((e) => e.id),
      ['c'],
    );
  });
});
