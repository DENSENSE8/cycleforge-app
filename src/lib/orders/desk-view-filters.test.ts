import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDeskCounts,
  parseDeskPairParam,
  parseDeskQueueParam,
  readDeskViewFilters,
  shortageDeskRedirectSearch,
} from './desk-view-filters';

test('lenses accept only their one value — anything else is no lens (unfiltered)', () => {
  assert.equal(parseDeskPairParam('po'), 'po');
  assert.equal(parseDeskPairParam(' PO '), 'po');
  assert.equal(parseDeskPairParam('receiving'), null);
  assert.equal(parseDeskPairParam(''), null);
  assert.equal(parseDeskPairParam(null), null);
  assert.equal(parseDeskQueueParam('pick'), 'pick');
  assert.equal(parseDeskQueueParam('Pick'), 'pick');
  assert.equal(parseDeskQueueParam('pack'), null);
  assert.equal(parseDeskQueueParam(undefined), null);
});

test('readDeskViewFilters reads both lenses off the URL', () => {
  assert.deepEqual(readDeskViewFilters(new URLSearchParams('pair=po&queue=pick&stage=tested')), {
    pair: 'po',
    queue: 'pick',
  });
  assert.deepEqual(readDeskViewFilters(new URLSearchParams('stage=tested')), { pair: null, queue: null });
});

test('bare Shortage desk redirects to pair=po and keeps every other param', () => {
  const search = shortageDeskRedirectSearch({ openOrderId: '42', staff: '7' });
  assert.ok(search);
  const params = new URLSearchParams(search);
  assert.equal(params.get('pair'), 'po');
  assert.equal(params.get('openOrderId'), '42');
  assert.equal(params.get('staff'), '7');
});

test('canonical pair=po does not redirect (no loop)', () => {
  assert.equal(shortageDeskRedirectSearch({ pair: 'po' }), null);
  assert.equal(shortageDeskRedirectSearch({ pair: 'po', q: 'bose' }), null);
});

test('a foreign, non-canonical or repeated pair is replaced by the one view', () => {
  assert.equal(new URLSearchParams(shortageDeskRedirectSearch({ pair: 'all' }) ?? '').getAll('pair').join(), 'po');
  assert.equal(new URLSearchParams(shortageDeskRedirectSearch({ pair: 'PO' }) ?? '').getAll('pair').join(), 'po');
  assert.equal(
    new URLSearchParams(shortageDeskRedirectSearch({ pair: ['po', 'po'] }) ?? '').getAll('pair').join(),
    'po',
  );
});

test('repeated non-pair params survive the redirect intact', () => {
  const params = new URLSearchParams(shortageDeskRedirectSearch({ c0: ['a', 'b'] }) ?? '');
  assert.deepEqual(params.getAll('c0'), ['a', 'b']);
});

test('desk counts payload: missing, non-numeric or negative values read 0', () => {
  assert.deepEqual(normalizeDeskCounts({ exceptions: 3, po: '2', pick: -1, triage: 'x' }), {
    exceptions: 3,
    po: 2,
    pick: 0,
    triage: 0,
    shippedToday: 0,
  });
  assert.deepEqual(normalizeDeskCounts(null), {
    exceptions: 0,
    po: 0,
    pick: 0,
    triage: 0,
    shippedToday: 0,
  });
});
