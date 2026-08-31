import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  SEARCH_BY_SCOPES,
  SEARCH_BY_METHOD_LABEL,
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
  it('the common methods lead; Internal ID sits last', () => {
    // Left-to-right pill order. Internal ID is the deliberate one — you reach
    // for it holding a printed handle — so it does not take the nearest seat.
    assert.deepEqual(SEARCH_BY_SCOPES, [
      'order',
      'tracking',
      'serial',
      'ticket',
      'internal',
    ]);
  });

  it('picker index maps 1:1 to the five methods', () => {
    assert.equal(searchByPickerCount(), 5);
    assert.equal(searchByPickerScope(0), 'order');
    assert.equal(searchByPickerScope(4), 'internal');
    assert.equal(searchByPickerScope(5), null);
    assert.equal(searchByPickerValue(1), 'tracking');
  });

  it('pill labels are one word — no "number", no hash', () => {
    // The field beside them already says an identifier goes here; the pill only
    // has to name which kind.
    assert.deepEqual(
      SEARCH_BY_SCOPES.map((s) => SEARCH_BY_METHOD_LABEL[s]),
      ['Order', 'Tracking', 'Serial', 'Ticket', 'ID'],
    );
    for (const label of Object.values(SEARCH_BY_METHOD_LABEL)) {
      assert.ok(!label.includes('#'), `${label} must not carry a hash`);
      assert.ok(!/number/i.test(label), `${label} must not spell "number"`);
    }
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
    // The placeholder carries the descriptive hint, since the pill went short.
    assert.equal(searchByPlaceholder('order'), 'Marketplace order #…');
    assert.equal(searchByPlaceholder('serial'), 'Unit serial…');
    assert.equal(searchByPlaceholder('tracking'), 'Carrier tracking…');
    assert.equal(searchByPlaceholder('ticket'), 'Support or repair ticket…');
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
