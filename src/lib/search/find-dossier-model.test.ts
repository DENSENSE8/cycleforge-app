/**
 * FIND record events — the kind catalog, newest-first, tracking is not a sel
 * type, and the timeline rows a `/search` record paints.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUiEntityType } from '@/lib/search/search-hit';
import { parseSearchSel } from '@/lib/search/search-selection';
import {
  FIND_EVENT_KINDS,
  eventsNewestFirst,
  findEventsToTimelineItems,
  isFindEventKind,
  type FindEvent,
} from './find-dossier-model';

function ev(
  partial: Pick<FindEvent, 'id' | 'kind' | 'at'> & Partial<FindEvent>,
): FindEvent {
  return { title: partial.kind, ...partial };
}

describe('FIND event kinds', () => {
  it('is the locked catalog — custody is the scan, hop is the round trip', () => {
    assert.deepEqual([...FIND_EVENT_KINDS], [
      'qty',
      'custody',
      'hop',
      'evidence',
      'exception',
      'bind',
      'carrier',
      'note',
    ]);
    // `status` is the hero pin and a custody row's status trail — never a face.
    assert.equal(isFindEventKind('status'), false);
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

describe('eventsNewestFirst', () => {
  it('sorts newest-first without dropping children', () => {
    const events = [
      ev({ id: 'old', kind: 'note', at: '2026-01-01T00:00:00.000Z' }),
      ev({ id: 'new', kind: 'custody', at: '2026-09-10T00:00:00.000Z' }),
      ev({ id: 'mid', kind: 'bind', at: '2026-06-01T00:00:00.000Z' }),
    ];
    assert.deepEqual(
      eventsNewestFirst(events).map((e) => e.id),
      ['new', 'mid', 'old'],
    );
  });
});

describe('findEventsToTimelineItems', () => {
  it('lifts carrier sub-events into their own rows, newest-first', () => {
    const items = findEventsToTimelineItems([
      ev({ id: 'scan', kind: 'custody', at: '2026-09-01T00:00:00.000Z' }),
      ev({
        id: 'ship',
        kind: 'carrier',
        at: '2026-09-02T00:00:00.000Z',
        children: [ev({ id: 'delivered', kind: 'custody', at: '2026-09-04T00:00:00.000Z' })],
      }),
    ]);
    assert.deepEqual(items.map((item) => item.id), ['delivered', 'ship', 'scan']);
  });

  it('keeps who, the bound identifiers, the qty ledger and an open exception', () => {
    const [row] = findEventsToTimelineItems([
      ev({
        id: 'x',
        kind: 'exception',
        at: '2026-09-01T00:00:00.000Z',
        title: 'Short received',
        actor: 'Tuan',
        stationCaption: 'Unbox',
        qty: { ordered: 3, received: 2 },
        bind: { serial: 'SN1', tracking: '1Z9' },
      }),
    ]);
    assert.equal(row?.actor, 'Tuan');
    assert.equal(row?.subtitle, 'Unbox · Ordered 3 · Received 2');
    assert.deepEqual(row?.refs?.map((ref) => ref.value), ['SN1', '1Z9']);
    assert.deepEqual(row?.badges, [{ label: 'Open exception', tone: 'warning' }]);
  });
});
