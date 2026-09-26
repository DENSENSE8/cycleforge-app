import test from 'node:test';
import assert from 'node:assert/strict';

import { foldKey, singleBand, type FoldState, type GroupedRenderOrder } from '@/lib/group-rows';
import { recordIdKey, resolveRecordCursor } from './cursor-model';

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface Row {
  id: number;
  orderId?: string;
}

const getId = (row: Row) => row.id;

/** Flat, one row per group — the shape a rail or an ungrouped lane publishes. */
const flat = (...ids: number[]): GroupedRenderOrder<Row> =>
  singleBand(ids.map((id) => ({ id })));

/** Two day bands, each holding folds. Mirrors `useOrdersQueueRows` output. */
const banded = (
  bands: Array<[string, Array<{ key: string; ids: number[] }>]>,
): GroupedRenderOrder<Row> =>
  bands.map(([band, groups]) => [
    band,
    groups.map((g) => ({ key: g.key, rows: g.ids.map((id) => ({ id })) })),
  ]);

const collapsedExcept = (...expanded: string[]): FoldState => ({
  mode: 'default-collapsed',
  expanded: new Set(expanded),
});

const expandedExcept = (...collapsed: string[]): FoldState => ({
  mode: 'default-expanded',
  collapsed: new Set(collapsed),
});

const cursor = (args: Partial<Parameters<typeof resolveRecordCursor<Row>>[0]> = {}) =>
  resolveRecordCursor<Row>({
    scope: 'record',
    order: flat(10, 20, 30),
    openId: null,
    getId,
    ...args,
  });

// ─── Absorbed from station-table-logic.test.ts ─────────────────────────────── `resolveDetailsNavigation` was the one pure stepper in the…

test('steps down to the next record', () => {
  assert.equal(cursor({ openId: 20 }).next?.id, 30);
});

test('steps up to the previous record', () => {
  assert.equal(cursor({ openId: 20 }).prev?.id, 10);
});

test('returns null when stepping past the end', () => {
  assert.equal(cursor({ openId: 30 }).next, null);
});

test('returns null when stepping past the start', () => {
  assert.equal(cursor({ openId: 10 }).prev, null);
});

// ─── Position + total ────────────────────────────────────────────────────────

test('position is 1-based and total counts every leaf', () => {
  const c = cursor({ openId: 20 });
  assert.equal(c.position, 2);
  assert.equal(c.total, 3);
});

test('an empty order has no position, no total and no first', () => {
  const c = cursor({ order: [], openId: null });
  assert.equal(c.position, null);
  assert.equal(c.total, 0);
  assert.equal(c.first, null);
  assert.equal(c.prev, null);
  assert.equal(c.next, null);
});

test('an open id absent from the order yields no position but keeps `first` live', () => {
  // The `?openOrderId=` boot window: the panel resolves before the queue fetch
  // lands. ↓ must still open something rather than going dead.
  const c = cursor({ openId: 999 });
  assert.equal(c.position, null);
  assert.equal(c.prev, null);
  assert.equal(c.next, null);
  assert.equal(c.first?.id, 10);
});

test('`first` is independent of what is open', () => {
  assert.equal(cursor({ openId: 30 }).first?.id, 10);
});

test('scope is echoed back so a two-cursor surface cannot mix them up', () => {
  assert.equal(cursor({ scope: 'sibling', openId: 10 }).scope, 'sibling');
});

// ─── Id identity ─────────────────────────────────────────────────────────────

test('recordIdKey collapses the string/number split a URL param introduces', () => {
  assert.equal(recordIdKey(42), recordIdKey('42'));
  assert.equal(recordIdKey(null), null);
  assert.equal(recordIdKey(undefined), null);
  assert.equal(recordIdKey(''), null);
});

test('a string openId matches a numeric row id', () => {
  // `?openOrderId=20` arrives as a string; rows carry numbers. `===` would never
  // match and the cursor would silently report "nothing open" on every deep link.
  const c = cursor({ openId: '20' });
  assert.equal(c.position, 2);
  assert.equal(c.next?.id, 30);
});

// ─── Folds: reveal, never skip ───────────────────────────────────────────────

const FOLDED: GroupedRenderOrder<Row> = banded([
  ['2026-08-01', [
    { key: 'A', ids: [1] },
    { key: 'B', ids: [2, 3, 4] },
    { key: 'C', ids: [5] },
  ]],
]);

const FOLD_B = foldKey('2026-08-01', 'B');

test('stepping into a COLLAPSED fold names the fold to reveal', () => {
  // Plan §2.2: the operator is on row 1; ↓ must expand B and land on row 2,
  // never open a row the grid is not showing.
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order: FOLDED,
    folds: collapsedExcept(),
    openId: 1,
    getId,
  });
  assert.equal(c.next?.id, 2);
  assert.equal(c.next?.revealFoldKey, FOLD_B);
});

test('stepping into an EXPANDED fold reveals nothing', () => {
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order: FOLDED,
    folds: collapsedExcept(FOLD_B),
    openId: 1,
    getId,
  });
  assert.equal(c.next?.id, 2);
  assert.equal(c.next?.revealFoldKey, null);
});

test('a singleton group never emits a reveal key', () => {
  // `QueueGroupRow` renders a singleton's leaf directly — no summary row, no
  // chevron — so it can never BE collapsed. A key here would write a fold id
  // nothing renders.
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order: FOLDED,
    folds: collapsedExcept(),
    openId: 4,
    getId,
  });
  assert.equal(c.next?.id, 5);
  assert.equal(c.next?.revealFoldKey, null);
});

test('prev and next can name DIFFERENT folds — which is why reveal is per direction', () => {
  const order = banded([
    ['d', [
      { key: 'X', ids: [1, 2] },
      { key: 'Y', ids: [3] },
      { key: 'Z', ids: [4, 5] },
    ]],
  ]);
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order,
    folds: collapsedExcept(),
    openId: 3,
    getId,
  });
  assert.equal(c.prev?.revealFoldKey, foldKey('d', 'X'));
  assert.equal(c.next?.revealFoldKey, foldKey('d', 'Z'));
  assert.notEqual(c.prev?.revealFoldKey, c.next?.revealFoldKey);
});

test('a deep link INTO a collapsed fold asks the surface to reveal it on mount', () => {
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order: FOLDED,
    folds: collapsedExcept(),
    openId: 3,
    getId,
  });
  assert.equal(c.openRevealFoldKey, FOLD_B);
});

test('an open record in an expanded fold needs no reveal', () => {
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order: FOLDED,
    folds: collapsedExcept(FOLD_B),
    openId: 3,
    getId,
  });
  assert.equal(c.openRevealFoldKey, null);
});

test('fold POLARITY is read from the value, not guessed', () => {
  // The same empty Set means "all collapsed" on a default-collapsed surface and
  // "all expanded" on a default-expanded one. Guessing is silently wrong on one.
  const asCollapsed = resolveRecordCursor<Row>({
    scope: 'record', order: FOLDED, folds: collapsedExcept(), openId: 1, getId,
  });
  const asExpanded = resolveRecordCursor<Row>({
    scope: 'record', order: FOLDED, folds: expandedExcept(), openId: 1, getId,
  });
  assert.equal(asCollapsed.next?.revealFoldKey, FOLD_B);
  assert.equal(asExpanded.next?.revealFoldKey, null);
});

test('omitting folds entirely treats every fold as open', () => {
  const c = resolveRecordCursor<Row>({ scope: 'record', order: FOLDED, openId: 1, getId });
  assert.equal(c.next?.revealFoldKey, null);
});

test('position and total are FOLD-BLIND — a fold toggle does not move them', () => {
  // Reveal-never-skip makes every record reachable, so the visible order is not
  // the navigation domain. A total that jumped when the operator opened an
  // unrelated fold would be worse than one that counts rows behind a chevron.
  const closed = resolveRecordCursor<Row>({
    scope: 'record', order: FOLDED, folds: collapsedExcept(), openId: 5, getId,
  });
  const open = resolveRecordCursor<Row>({
    scope: 'record', order: FOLDED, folds: collapsedExcept(FOLD_B), openId: 5, getId,
  });
  assert.equal(closed.total, 5);
  assert.equal(open.total, 5);
  assert.equal(closed.position, open.position);
});

// ─── Band qualification ──────────────────────────────────────────────────────

test('the same group key in two bands is two distinct folds', () => {
  // `groupRowsBy` keys are band-LOCAL: one order whose lines carry different
  // deadlines lands one group per band under the same key. An unqualified key
  // would toggle both folds together and make the reveal ambiguous.
  const order = banded([
    ['2026-08-01', [{ key: 'ORD-1', ids: [1, 2] }]],
    ['2026-08-02', [{ key: 'ORD-1', ids: [3, 4] }]],
  ]);
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order,
    folds: collapsedExcept(foldKey('2026-08-01', 'ORD-1')),
    openId: 2,
    getId,
  });
  // Crossing the band boundary into the still-collapsed second fold.
  assert.equal(c.next?.id, 3);
  assert.equal(c.next?.revealFoldKey, foldKey('2026-08-02', 'ORD-1'));
  assert.notEqual(foldKey('2026-08-01', 'ORD-1'), foldKey('2026-08-02', 'ORD-1'));
});

test('foldKey is injective across a band/group boundary shift', () => {
  // Length-prefixed, so `('a', 'b:c')` and `('a:b', 'c')` cannot collide.
  assert.notEqual(foldKey('a', 'b:c'), foldKey('a:b', 'c'));
});

// ─── Deduped-rail group fallback ─────────────────────────────────────────────

test('falls back to the GROUP when the open id is not itself a row', () => {
  // The unbox Unboxed rail keeps one row per receiving_id, so the selected LINE
  // is not a row in the order. Reproduces `useSidebarRail.ts:423–427`.
  const rows: Row[] = [
    { id: 10, orderId: 'po-1' },
    { id: 20, orderId: 'po-2' },
    { id: 30, orderId: 'po-3' },
  ];
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order: singleBand(rows),
    openId: 999, // a line id, absent from the rail
    getId,
    getGroupKey: (row) => row.orderId ?? null,
    openGroupKey: 'po-2',
  });
  assert.equal(c.position, 2);
  assert.equal(c.prev?.id, 10);
  assert.equal(c.next?.id, 30);
});

test('the group fallback is ignored when only half of it is supplied', () => {
  const c = resolveRecordCursor<Row>({
    scope: 'record',
    order: flat(10, 20),
    openId: 999,
    getId,
    openGroupKey: 'po-2', // no getGroupKey → nothing to match against
  });
  assert.equal(c.position, null);
});

// ─── Guard: the assertions above must be load-bearing ────────────────────────

test('a fold key is not merely the group key', () => {
  // Catches an implementation that "passes" the reveal tests by echoing
  // `group.key` — which would collide across bands (see the band test above).
  assert.notEqual(FOLD_B, 'B');
});
