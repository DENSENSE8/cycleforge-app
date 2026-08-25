/**
 * The params codec, round-tripped.
 *
 * A behaviour test over pure functions — it mounts nothing and reads no source
 * file. What it pins is the two rules a tab's view state has to obey to survive
 * `staff_preferences`: a default writes NOTHING (so a pristine tab persists an
 * empty bag), and a set encodes canonically (so two tabs that hid the same two
 * columns in a different order produce one string, not two).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTabHiddenColumns,
  formatTabHiddenColumns,
  parseTabHiddenColumns,
  readTabBool,
  readTabEnum,
  readTabEnumOrNull,
  readTabInt,
  readTabSort,
  setTabSortPatch,
  toggleTabHiddenColumnPatch,
  toggleTabSortPatch,
} from './table-tab-params';

const SORTABLE = new Set(['title', 'age', 'qty']);
const isColumn = (raw: string) => SORTABLE.has(raw);
const defaultDir = (key: string) => (key === 'age' ? 'desc' : 'asc') as 'asc' | 'desc';

test('an absent sort is the family default, not a sort named ""', () => {
  assert.deepEqual(readTabSort({}, isColumn, defaultDir), { sort: null, dir: null });
  assert.deepEqual(readTabSort({ sort: '' }, isColumn, defaultDir), { sort: null, dir: null });
});

test('a retired sort key resolves to no sort rather than a dead comparator', () => {
  assert.deepEqual(
    readTabSort({ sort: 'columnThatWasDeleted' }, isColumn, defaultDir),
    { sort: null, dir: null },
  );
});

test('direction falls back to the COLUMN default, not a global asc', () => {
  assert.deepEqual(readTabSort({ sort: 'age' }, isColumn, defaultDir), {
    sort: 'age',
    dir: 'desc',
  });
  assert.deepEqual(readTabSort({ sort: 'title' }, isColumn, defaultDir), {
    sort: 'title',
    dir: 'asc',
  });
  assert.deepEqual(readTabSort({ sort: 'age', dir: 'asc' }, isColumn, defaultDir), {
    sort: 'age',
    dir: 'asc',
  });
});

test('header clicks cycle default → flipped → off', () => {
  const none = readTabSort({}, isColumn, defaultDir);
  const first = toggleTabSortPatch(none, 'age', defaultDir);
  assert.deepEqual(first, { sort: 'age', dir: undefined });

  const active = readTabSort({ sort: 'age' }, isColumn, defaultDir);
  assert.deepEqual(toggleTabSortPatch(active, 'age', defaultDir), { sort: 'age', dir: 'asc' });

  const flipped = readTabSort({ sort: 'age', dir: 'asc' }, isColumn, defaultDir);
  assert.deepEqual(toggleTabSortPatch(flipped, 'age', defaultDir), {
    sort: undefined,
    dir: undefined,
  });
});

test('a new column activates at its own default and drops any stale dir', () => {
  const flipped = readTabSort({ sort: 'age', dir: 'asc' }, isColumn, defaultDir);
  assert.deepEqual(toggleTabSortPatch(flipped, 'title', defaultDir), {
    sort: 'title',
    dir: undefined,
  });
});

test('setting the column default persists one key, not two', () => {
  assert.deepEqual(setTabSortPatch('age', 'desc', defaultDir), { sort: 'age', dir: undefined });
  assert.deepEqual(setTabSortPatch('age', 'asc', defaultDir), { sort: 'age', dir: 'asc' });
});

test('the hide delta round-trips, canonically sorted', () => {
  const patch = formatTabHiddenColumns(new Set(['tracking', 'orderid', 'qty']));
  assert.equal(patch.hide, 'orderid~qty~tracking');
  assert.deepEqual([...parseTabHiddenColumns({ hide: patch.hide as string })].sort(), [
    'orderid',
    'qty',
    'tracking',
  ]);
});

test('an empty hide delta removes the key instead of writing ""', () => {
  assert.deepEqual(formatTabHiddenColumns(new Set()), { hide: undefined });
  assert.equal(parseTabHiddenColumns({ hide: '' }).size, 0);
  assert.equal(parseTabHiddenColumns({}).size, 0);
});

test('toggling a hidden column is its own inverse', () => {
  const first = toggleTabHiddenColumnPatch(new Set(), 'qty');
  assert.equal(first.hide, 'qty');
  const back = toggleTabHiddenColumnPatch(parseTabHiddenColumns({ hide: 'qty' }), 'qty');
  assert.equal(back.hide, undefined);
});

test('structural tracks survive any delta; an emptying delta is ignored', () => {
  const columns = [
    { key: 'select', width: '2rem' },
    { key: 'title', width: '1fr' },
    { key: 'qty', width: '4rem', hideKey: 'qty' },
  ];
  assert.deepEqual(
    applyTabHiddenColumns(columns, new Set(['qty'])).map((c) => c.key),
    ['select', 'title'],
  );
  // Every column hideable and every one hidden — keep the grid rather than
  // paint zero tracks.
  const allHideable = [{ key: 'qty', width: '4rem', hideKey: 'qty' }];
  assert.equal(applyTabHiddenColumns(allHideable, new Set(['qty'])).length, 1);
});

test('scalar readers accept the wire forms a persisted bag can hold', () => {
  assert.equal(readTabInt({ week: 2 }, 'week', 0), 2);
  assert.equal(readTabInt({ week: '3' }, 'week', 0), 3);
  assert.equal(readTabInt({ week: 'x' }, 'week', 0), 0);
  assert.equal(readTabBool({ urgent: true }, 'urgent'), true);
  assert.equal(readTabBool({ urgent: '1' }, 'urgent'), true);
  assert.equal(readTabBool({ urgent: 'no' }, 'urgent'), false);
  assert.equal(readTabEnum({ view: 'done' }, 'view', ['open', 'done'] as const, 'open'), 'done');
  assert.equal(readTabEnum({ view: 'gone' }, 'view', ['open', 'done'] as const, 'open'), 'open');
  assert.equal(readTabEnumOrNull({ state: 'x' }, 'state', ['a', 'b'] as const), null);
  assert.equal(readTabEnumOrNull({ state: 'b' }, 'state', ['a', 'b'] as const), 'b');
});
