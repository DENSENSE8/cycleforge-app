/**
 * The engine's BANDING rule.
 *
 * `bandCompoundRows` is the only behaviour the `bandBy` option adds, so most of
 * this is pure: the no-option default must stay `singleBand` (every existing
 * mount reads its order from here), band order must follow the already-applied
 * sort, and a band with no caption must still be a band. The last two cases
 * mount the hook itself — with no DOM and no DataTable — because the shape of
 * the returned feed is the other half of "nothing moved".
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  bandCompoundRows,
  useCompoundSpreadsheet,
  type CompoundSpreadsheetColumn,
  type CompoundSpreadsheetFeed,
  type UseCompoundSpreadsheetOptions,
} from '@/components/tables/useCompoundSpreadsheet';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { SINGLE_BAND_KEY, flattenRenderOrder, singleBand } from '@/lib/group-rows';

interface Row {
  id: string;
  type: string;
}

const ROWS: readonly Row[] = [
  { id: 'a', type: 'checklist' },
  { id: 'b', type: 'checklist' },
  { id: 'c', type: 'task' },
  { id: 'd', type: 'checklist' },
  { id: 'e', type: 'task' },
];

test('omitting bandBy is byte-identical to the singleBand path, for every row shape', () => {
  // The whole value of the option is that ~40 existing mounts do not move, so
  // equality with `singleBand` is asserted structurally (deepStrictEqual walks
  // band key, group key and row identity), not by reading the code.
  const shapes: readonly (readonly Row[])[] = [
    [],
    [ROWS[0]],
    ROWS,
    [...ROWS].reverse(),
  ];
  for (const rows of shapes) {
    assert.deepStrictEqual(bandCompoundRows(rows), singleBand(rows));
  }

  const banded = bandCompoundRows(ROWS);
  assert.equal(banded.length, 1);
  assert.equal(banded[0][0], SINGLE_BAND_KEY);
  // Row IDENTITY, not a structural clone: the default path must hand the same
  // objects through, or memoized consumers downstream would re-render.
  banded[0][1].forEach((group, index) => {
    assert.equal(group.key, `#${index}`);
    assert.equal(group.rows[0], ROWS[index]);
  });
});

test('bandBy yields bands in first-encountered order, not key order', () => {
  // 'task' sorts before 'checklist' alphabetically; the row list decides.
  const banded = bandCompoundRows(ROWS, (row) => row.type);
  assert.deepEqual(
    banded.map(([key]) => key),
    ['checklist', 'task'],
  );

  const reversed = bandCompoundRows([...ROWS].reverse(), (row) => row.type);
  assert.deepEqual(
    reversed.map(([key]) => key),
    ['task', 'checklist'],
  );
});

test('every row lands in exactly one band, and the group model stays one row per group', () => {
  const banded = bandCompoundRows(ROWS, (row) => row.type);

  const placements = new Map<string, number>();
  for (const [, groups] of banded) {
    for (const group of groups) {
      assert.equal(group.rows.length, 1, 'a band member is still its own singleton group');
      for (const row of group.rows) placements.set(row.id, (placements.get(row.id) ?? 0) + 1);
    }
  }
  assert.deepEqual([...placements.values()], [1, 1, 1, 1, 1]);
  assert.deepEqual(
    [...placements.keys()].sort(),
    ROWS.map((row) => row.id).sort(),
  );

  // Band grouping REORDERS rows into their bands; it never drops or clones one.
  assert.deepEqual(
    flattenRenderOrder(banded).map((row) => row.id),
    ['a', 'b', 'd', 'c', 'e'],
  );

  // Fold keys stay globally unique, so two bands cannot collide on '#0'.
  const groupKeys = banded.flatMap(([, groups]) => groups.map((group) => group.key));
  assert.equal(new Set(groupKeys).size, groupKeys.length);
});

test('a band key with no caption is still a band', () => {
  const sectionHeaders: Record<string, string> = { checklist: 'Daily checklist' };
  const banded = bandCompoundRows(ROWS, (row) => row.type);

  assert.deepEqual(
    banded.map(([key]) => key),
    ['checklist', 'task'],
  );
  assert.equal(sectionHeaders['task'], undefined);
  assert.equal(banded.find(([key]) => key === 'task')?.[1].length, 2);
});

/**
 * Mount the hook for real (no DOM, no DataTable) and read the feed bag back.
 *
 * The banding rule above is pure, but "what the feed carries when nobody asked
 * for bands" is a property of the RETURN LITERAL, and only the hook can answer
 * it. `renderToStaticMarkup` of a component that returns `null` runs the hook
 * once with the real React dispatcher and nothing else.
 */
function mountFeed(
  options?: Partial<Pick<UseCompoundSpreadsheetOptions<Row, string, CompoundSpreadsheetColumn>, 'bandBy' | 'sectionHeaders'>>,
): CompoundSpreadsheetFeed<Row, string, CompoundSpreadsheetColumn> {
  let feed: CompoundSpreadsheetFeed<Row, string, CompoundSpreadsheetColumn> | null = null;
  function Probe() {
    feed = useCompoundSpreadsheet<Row, string, CompoundSpreadsheetColumn>({
      binding: { rowPlane: 'navigate' } as unknown as TableSurfaceBinding<Row, CompoundSpreadsheetColumn>,
      columns: [],
      rows: ROWS,
      getRowId: (row) => row.id,
      adapter: (row) => ({ title: row.id }),
      resolve: () => null,
      sortFactFor: () => null,
      capabilities: {},
      sort: null,
      dir: null,
      onSortChange: () => {},
      search: { value: '', onChange: () => {} },
      loading: false,
      emptyMessage: 'none',
      ...options,
    });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  assert.ok(feed, 'the probe ran the hook');
  return feed;
}

test('the feed carries sectionHeaders undefined when unset, so the renderer default holds', () => {
  const feed = mountFeed();
  // `undefined`, never `{}`: `<DataTable {...sheet} />` spreads an undefined
  // prop, which is the same as not passing it — VirtualGroupedSections reads
  // `sectionHeaders?.[band]`, so every band stays unlabelled exactly as today.
  assert.equal(feed.sectionHeaders, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(feed, 'sectionHeaders'), true);
  assert.deepStrictEqual(feed.orderGroupsByDate, singleBand(ROWS));
});

test('the feed forwards the captions it was given, banded', () => {
  const feed = mountFeed({
    bandBy: (row) => row.type,
    sectionHeaders: { checklist: 'Daily checklist', task: 'Task' },
  });
  assert.deepEqual(feed.sectionHeaders, { checklist: 'Daily checklist', task: 'Task' });
  assert.deepEqual(
    feed.orderGroupsByDate.map(([key]) => key),
    ['checklist', 'task'],
  );
});
