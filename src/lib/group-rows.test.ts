import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  SINGLE_BAND_KEY,
  flattenRenderOrder,
  flattenVisibleRenderOrder,
  foldKey,
  groupRowsBy,
  isFoldOpen,
  singleBand,
  type CollapsedFoldRendering,
  type FoldState,
  type GroupedRenderOrder,
} from './group-rows';

interface Row {
  id: number;
  order: string;
}

const row = (id: number, order: string): Row => ({ id, order });

/** Two date bands, each holding the SAME order key `A` plus its own singleton.
 *  This is the multi-line-order-with-split-deadlines shape from the plan. */
function bandedOrder(): GroupedRenderOrder<Row> {
  return [
    [
      '2026-08-01',
      [
        { key: 'A', rows: [row(1, 'A'), row(2, 'A')] },
        { key: 'B', rows: [row(3, 'B')] },
      ],
    ],
    [
      '2026-08-02',
      [
        { key: 'A', rows: [row(4, 'A'), row(5, 'A')] },
        { key: 'C', rows: [row(6, 'C')] },
      ],
    ],
  ];
}

const ids = (rows: Row[]) => rows.map((r) => r.id);

const BOTH_RENDERINGS: readonly CollapsedFoldRendering[] = ['leading-row', 'summary-only'];

// ── groupRowsBy — the existing SoT, pinned ────────────────────────────────────

test('groupRowsBy preserves first-seen order of both groups and their rows', () => {
  const grouped = groupRowsBy(
    [row(1, 'A'), row(2, 'B'), row(3, 'A'), row(4, 'C'), row(5, 'B')],
    (r) => r.order,
  );
  assert.deepEqual(
    grouped.map((g) => g.key),
    ['A', 'B', 'C'],
  );
  assert.deepEqual(grouped.map((g) => ids(g.rows)), [[1, 3], [2, 5], [4]]);
});

test('groupRowsBy of nothing is nothing', () => {
  assert.deepEqual(groupRowsBy<Row>([], (r) => r.order), []);
});

// ── foldKey — band qualification is the whole point ───────────────────────────

test('the same group key in two bands is two different folds', () => {
  // A multi-line order whose lines carry different `deadline_at` lands one group
  // per band under the SAME `groupRowsBy` key. One raw-key Set would toggle both
  // folds together and `reveal` could not say which band it meant.
  assert.notEqual(foldKey('2026-08-01', 'A'), foldKey('2026-08-02', 'A'));
  assert.equal(foldKey('2026-08-01', 'A'), foldKey('2026-08-01', 'A'));
});

test('foldKey is injective even when a key contains the separator', () => {
  // A plain `${band}:${group}` join collides here; the length prefix does not.
  assert.notEqual(foldKey('a:b', 'c'), foldKey('a', 'b:c'));
  assert.notEqual(foldKey('', 'a'), foldKey('a', ''));
  assert.notEqual(foldKey('1:2', '3'), foldKey('1', '2:3'));
});

// ── singleBand — the flat-surface adapter ─────────────────────────────────────

test('singleBand with no key fn makes every row its own singleton group', () => {
  // `useSidebarRail` holds a flat rows array and receiving's sibling domain is a
  // filtered flat array; without this neither could publish a cursor at all.
  const order = singleBand([row(1, 'A'), row(2, 'A'), row(3, 'B')]);
  assert.equal(order.length, 1);
  assert.equal(order[0]![0], SINGLE_BAND_KEY);
  const groups = order[0]![1];
  assert.equal(groups.length, 3);
  for (const group of groups) assert.equal(group.rows.length, 1);
  assert.deepEqual(ids(flattenRenderOrder(order)), [1, 2, 3]);
});

test('singleBand singleton keys are unique, so two identical rows never merge', () => {
  const groups = singleBand([row(1, 'A'), row(2, 'A')])[0]![1];
  assert.equal(new Set(groups.map((g) => g.key)).size, 2);
});

test('singleBand with a key fn folds, preserving order', () => {
  const order = singleBand([row(1, 'A'), row(2, 'B'), row(3, 'A')], (r) => r.order);
  const groups = order[0]![1];
  assert.deepEqual(groups.map((g) => g.key), ['A', 'B']);
  assert.deepEqual(groups.map((g) => ids(g.rows)), [[1, 3], [2]]);
  assert.deepEqual(ids(flattenRenderOrder(order)), [1, 3, 2]);
});

test('singleBand of an empty list is one empty band, not zero bands', () => {
  const order = singleBand<Row>([]);
  assert.equal(order.length, 1);
  assert.deepEqual(order[0]![1], []);
  assert.deepEqual(flattenRenderOrder(order), []);
});

// ── isFoldOpen — polarity ─────────────────────────────────────────────────────

test('no fold state means every fold is open — the pre-fold-state behaviour', () => {
  // This is what makes adopting the module a no-op for callers that do not track
  // folds yet.
  assert.equal(isFoldOpen(undefined, foldKey('b', 'A')), true);
  assert.equal(isFoldOpen(undefined, 'anything at all'), true);
});

test('an EMPTY set means opposite things in the two modes', () => {
  // The rail (default-expanded) initializes with `new Set()`. Read under
  // expanded-set semantics that would collapse every rail group and its
  // scroll/focus targets would vanish.
  const key = foldKey('b', 'A');
  const collapsedDefault: FoldState = { mode: 'default-collapsed', expanded: new Set() };
  const expandedDefault: FoldState = { mode: 'default-expanded', collapsed: new Set() };
  assert.equal(isFoldOpen(collapsedDefault, key), false);
  assert.equal(isFoldOpen(expandedDefault, key), true);
});

test('each mode reads only its own set', () => {
  const key = foldKey('b', 'A');
  const other = foldKey('b', 'Z');
  assert.equal(isFoldOpen({ mode: 'default-collapsed', expanded: new Set([key]) }, key), true);
  assert.equal(isFoldOpen({ mode: 'default-collapsed', expanded: new Set([other]) }, key), false);
  assert.equal(isFoldOpen({ mode: 'default-expanded', collapsed: new Set([key]) }, key), false);
  assert.equal(isFoldOpen({ mode: 'default-expanded', collapsed: new Set([other]) }, key), true);
});

// ── flattenRenderOrder — fold-blind, the navigation domain ────────────────────

test('flattenRenderOrder walks bands, then folds, then rows', () => {
  assert.deepEqual(ids(flattenRenderOrder(bandedOrder())), [1, 2, 3, 4, 5, 6]);
});

test('flattenRenderOrder of an empty order is empty', () => {
  assert.deepEqual(flattenRenderOrder<Row>([]), []);
  assert.deepEqual(flattenRenderOrder<Row>([['2026-08-01', []]]), []);
});

test('flattenRenderOrder takes no fold state — total can never move under a fold', () => {
  // Reveal-never-skip makes every record reachable, so the fold-blind order IS
  // the navigation domain. A fold-aware walk would make "3 of 47" silently read
  // "3 of 44" after a toggle the operator did not make.
  assert.equal(flattenRenderOrder.length, 1);
  const before = flattenRenderOrder(bandedOrder()).length;
  // Nothing about fold state is even expressible here — same order, same total.
  assert.equal(flattenRenderOrder(bandedOrder()).length, before);
  assert.equal(before, 6);
});

// ── flattenVisibleRenderOrder — presentation only ─────────────────────────────

test('every fold open makes the visible order equal the fold-blind order', () => {
  const order = bandedOrder();
  const allOpen: FoldState = { mode: 'default-expanded', collapsed: new Set() };
  // With nothing collapsed the rendering discriminator cannot matter.
  for (const rendering of BOTH_RENDERINGS) {
    assert.deepEqual(
      ids(flattenVisibleRenderOrder(order, allOpen, rendering)),
      ids(flattenRenderOrder(order)),
    );
  }
});

test('a collapsed fold contributes its leading row ONLY where that row still renders', () => {
  // `useSidebarRail` hides members with `groupIndex > 0`, so index 0 keeps its DOM node and IS the collapsed fold's scroll target.
  const order = bandedOrder();
  const folds: FoldState = {
    mode: 'default-expanded',
    collapsed: new Set([foldKey('2026-08-01', 'A')]),
  };
  assert.deepEqual(ids(flattenVisibleRenderOrder(order, folds, 'leading-row')), [1, 3, 4, 5, 6]);
  assert.deepEqual(ids(flattenVisibleRenderOrder(order, folds, 'summary-only')), [3, 4, 5, 6]);
});

test('a collapsed fold in one band does not collapse the same key in another', () => {
  // The band-qualification bug, end to end: keys are band-local, so an
  // unqualified Set would have hidden rows 5 AND 2.
  const order = bandedOrder();
  const folds: FoldState = {
    mode: 'default-expanded',
    collapsed: new Set([foldKey('2026-08-02', 'A')]),
  };
  assert.deepEqual(ids(flattenVisibleRenderOrder(order, folds, 'leading-row')), [1, 2, 3, 4, 6]);
  assert.deepEqual(ids(flattenVisibleRenderOrder(order, folds, 'summary-only')), [1, 2, 3, 6]);
});

test('a singleton stays visible even when every fold reads as collapsed', () => {
  // `QueueGroupRow` returns `renderRow(group.rows[0])` for a one-row group before it ever reaches `CollapsibleGroupRow`:
  const order = bandedOrder();
  const collapseEverything: FoldState = { mode: 'default-collapsed', expanded: new Set() };
  assert.deepEqual(
    ids(flattenVisibleRenderOrder(order, collapseEverything, 'leading-row')),
    [1, 3, 4, 6],
  );
  assert.deepEqual(
    ids(flattenVisibleRenderOrder(order, collapseEverything, 'summary-only')),
    [3, 6],
  );

  // Even explicitly naming a singleton's fold key changes nothing, in either
  // rendering — the key is inert by construction.
  const withSingletonNamed: FoldState = {
    mode: 'default-expanded',
    collapsed: new Set([foldKey('2026-08-01', 'B'), foldKey('2026-08-02', 'C')]),
  };
  for (const rendering of BOTH_RENDERINGS) {
    assert.deepEqual(
      ids(flattenVisibleRenderOrder(order, withSingletonNamed, rendering)),
      [1, 2, 3, 4, 5, 6],
    );
  }
});

test('an EMPTY group contributes nothing — never an undefined hole', () => {
  // `groupRowsBy` cannot mint one, but `GroupedRenderOrder` is a public input shape a caller assembles by hand.
  const order: GroupedRenderOrder<Row> = [
    ['2026-08-01', [{ key: 'empty', rows: [] }, { key: 'B', rows: [row(3, 'B')] }]],
  ];
  assert.deepEqual(flattenRenderOrder(order), [row(3, 'B')]);
  for (const rendering of BOTH_RENDERINGS) {
    for (const folds of [
      { mode: 'default-collapsed', expanded: new Set<string>() } as const,
      { mode: 'default-expanded', collapsed: new Set<string>() } as const,
    ]) {
      const visible = flattenVisibleRenderOrder(order, folds, rendering);
      assert.deepEqual(visible, [row(3, 'B')]);
      assert.ok(visible.every((r) => r !== undefined));
    }
  }
});

test('a default-collapsed surface opens a fold by naming it', () => {
  const order = bandedOrder();
  const folds: FoldState = {
    mode: 'default-collapsed',
    expanded: new Set([foldKey('2026-08-02', 'A')]),
  };
  assert.deepEqual(ids(flattenVisibleRenderOrder(order, folds, 'leading-row')), [1, 3, 4, 5, 6]);
  assert.deepEqual(ids(flattenVisibleRenderOrder(order, folds, 'summary-only')), [3, 4, 5, 6]);
});

test('the visible order is a DIFFERENT answer from the fold-blind one', () => {
  // Named apart on purpose: feeding this to `countGridRows` / `aria-rowindex`
  // would renumber the grid on a fold toggle, which is exactly what
  // `grid-row-index.ts` stays fold-blind to prevent.
  const order = bandedOrder();
  const folds: FoldState = {
    mode: 'default-collapsed',
    expanded: new Set(),
  };
  assert.equal(flattenRenderOrder(order).length, 6);
  assert.equal(flattenVisibleRenderOrder(order, folds, 'leading-row').length, 4);
  assert.equal(flattenVisibleRenderOrder(order, folds, 'summary-only').length, 2);
});

test('a flat singleBand surface is unaffected by fold state or rendering', () => {
  // Every group is a singleton, so neither polarity nor the collapsed-fold
  // rendering can reach it — this is the shape `useSidebarRail` and receiving's
  // sibling pool publish.
  const order = singleBand([row(1, 'A'), row(2, 'B'), row(3, 'C')]);
  for (const rendering of BOTH_RENDERINGS) {
    for (const folds of [
      { mode: 'default-collapsed', expanded: new Set<string>() } as const,
      { mode: 'default-expanded', collapsed: new Set<string>() } as const,
    ]) {
      assert.deepEqual(ids(flattenVisibleRenderOrder(order, folds, rendering)), [1, 2, 3]);
    }
  }
});

test('both flattens return a fresh mutable array and never alias the input rows', () => {
  const order = bandedOrder();
  const flat = flattenRenderOrder(order);
  flat.pop();
  assert.equal(flattenRenderOrder(order).length, 6);
  const visible = flattenVisibleRenderOrder(
    order,
    { mode: 'default-expanded', collapsed: new Set() },
    'leading-row',
  );
  visible.pop();
  assert.equal(order[1]![1][1]!.rows.length, 1);
});
