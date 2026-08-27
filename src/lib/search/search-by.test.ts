import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  SEARCH_BY_SCOPES,
  filterHitsBySearchBy,
  parseSearchByScope,
  searchByPickerCount,
  searchByPickerScope,
  searchByPickerValue,
  searchByPlaceholder,
  searchByShortcut,
  toggleSearchByScope,
} from './search-by';

describe('search-by scope', () => {
  it('Internal ID is the first picker row, then order · tracking · serial · ticket', () => {
    assert.deepEqual(SEARCH_BY_SCOPES, [
      'internal',
      'order',
      'tracking',
      'serial',
      'ticket',
    ]);
  });

  it('picker index maps 1:1 to the five methods', () => {
    assert.equal(searchByPickerCount(), 5);
    assert.equal(searchByPickerScope(0), 'internal');
    assert.equal(searchByPickerScope(1), 'order');
    assert.equal(searchByPickerScope(5), null);
    assert.equal(searchByPickerValue(2), 'tracking');
  });

  it('parseSearchByScope accepts methods; unknown and legacy All become Internal ID', () => {
    assert.equal(parseSearchByScope('order'), 'order');
    assert.equal(parseSearchByScope('TRACKING'), 'tracking');
    assert.equal(parseSearchByScope('ticket'), 'ticket');
    assert.equal(parseSearchByScope('internal'), 'internal');
    assert.equal(parseSearchByScope('all'), 'internal');
    assert.equal(parseSearchByScope('phone'), 'internal');
    assert.equal(parseSearchByScope('sku'), 'internal');
    assert.equal(parseSearchByScope(null), 'internal');
  });

  it('toggle clears the same axis back to Internal ID', () => {
    assert.equal(toggleSearchByScope('internal', 'order'), 'order');
    assert.equal(toggleSearchByScope('order', 'order'), 'internal');
    assert.equal(toggleSearchByScope('order', 'tracking'), 'tracking');
    assert.equal(toggleSearchByScope('serial', 'internal'), 'internal');
  });

  it('placeholder names the method', () => {
    assert.equal(searchByPlaceholder('internal'), 'R-id, shipment, QR…');
    assert.equal(searchByPlaceholder('order'), 'Order number…');
    assert.equal(searchByPlaceholder('serial'), 'Serial number…');
    assert.equal(searchByPlaceholder('tracking'), 'Tracking number…');
    assert.equal(searchByPlaceholder('ticket'), 'Ticket number…');
  });

  it('shortcut letter is unique — ticket is # so it does not steal tracking T', () => {
    assert.equal(searchByShortcut('internal'), 'I');
    assert.equal(searchByShortcut('order'), 'O');
    assert.equal(searchByShortcut('serial'), 'S');
    assert.equal(searchByShortcut('tracking'), 'T');
    assert.equal(searchByShortcut('ticket'), '#');
  });
});

describe('filterHitsBySearchBy', () => {
  const hits = [
    { entityType: 'order', matchField: 'order' },
    { entityType: 'unit', matchField: 'serial' },
    { entityType: 'exception', matchField: 'tracking' },
    { entityType: 'sku', matchField: 'sku' },
    { entityType: 'receiving', matchField: 'support_ticket' },
    { entityType: 'repair', matchField: 'repair' },
    { entityType: 'order', matchField: 'id' },
    { entityType: 'receiving', matchField: 'receiving' },
  ];

  it('internal keeps PK / shipment / carton rows, not SKU / ticket / tracking-hold', () => {
    assert.deepEqual(
      filterHitsBySearchBy(hits, 'internal').map((h) => `${h.entityType}:${h.matchField}`),
      ['order:id', 'receiving:receiving'],
    );
  });

  it('order keeps orders and receiving cartons matched by marketplace #', () => {
    assert.deepEqual(
      filterHitsBySearchBy(hits, 'order').map((h) => `${h.entityType}:${h.matchField}`),
      ['order:order', 'order:id', 'receiving:receiving'],
    );
  });

  it('serial keeps units (and serial-matched rows)', () => {
    assert.deepEqual(
      filterHitsBySearchBy(hits, 'serial').map((h) => h.entityType),
      ['unit'],
    );
  });

  it('tracking keeps tracking-matched rows and orders', () => {
    assert.deepEqual(
      filterHitsBySearchBy(hits, 'tracking').map((h) => h.entityType),
      ['order', 'exception', 'order'],
    );
  });

  it('ticket keeps support-ticket and repair rows', () => {
    assert.deepEqual(
      filterHitsBySearchBy(hits, 'ticket').map((h) => h.entityType),
      ['receiving', 'repair'],
    );
  });
});
