/**
 * The launch index, asserted against the REAL registries rather than fixtures.
 *
 * The property that matters is not "the function returns rows" — it is that
 * the four kinds of openable thing are reachable by typing ONE query, and that
 * page rows still mean "navigate" so nothing the palette does had to change.
 * Both of those are only true of the live nav / surface / table registries, so
 * that is what this runs.
 *
 * Run: npx tsx --test src/lib/nav/launch-index.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLaunchIndex,
  filterLaunchIndex,
  isTabLaunch,
  launchCursorRows,
  type LaunchRow,
} from './launch-index';

const INDEX = buildLaunchIndex();
const ROWS = INDEX.flatMap((g) => g.rows);

const find = (id: string): LaunchRow | undefined =>
  ROWS.find((r) => r.id === id);

const search = (query: string) => launchCursorRows(filterLaunchIndex(INDEX, query));

test('one index carries all four launch kinds', () => {
  const kinds = new Set(ROWS.map((r) => r.kind ?? 'page'));
  assert.ok(kinds.has('page'), 'pages');
  assert.ok(kinds.has('session'), 'sessions');
  assert.ok(kinds.has('table'), 'tables');
  // Tools arrive with Phase 5's registry; the band is omitted until then rather
  // than rendered as a heading over nothing.
  assert.equal(kinds.has('tool'), false);
  assert.equal(
    INDEX.some((g) => g.id === 'tool'),
    false,
  );
});

test('a page row still means navigate — absent kind, present href', () => {
  const pages = ROWS.filter((r) => r.kind === undefined);
  assert.ok(pages.length > 0);
  assert.ok(
    pages.every((r) => typeof r.href === 'string' && r.href.length > 0),
    'every page row keeps the href the palette has always pushed',
  );
  assert.ok(
    pages.every((r) => r.ref === undefined),
    'a page has no tab ref — it is not a tab',
  );
});

test('every non-page row carries the ref openTab() needs', () => {
  const tabs = ROWS.filter((r) => r.kind !== undefined);
  assert.ok(tabs.length > 0);
  assert.ok(
    tabs.every((r) => typeof r.ref === 'string' && r.ref.length > 0),
    'openTab({ kind, ref }) has nothing to open without a ref',
  );
});

test('a session row binds the rail panel its own route would have mounted', () => {
  const unbox = find('session:unbox');
  assert.ok(unbox, 'the Unbox surface must be launchable');
  assert.equal(unbox!.kind, 'session');
  assert.equal(unbox!.ref, 'unbox');
  // /unbox resolves to the receiving route key, so focusing the tab shows the
  // receiving rail — the same panel the route itself mounts.
  assert.equal(unbox!.params?.panel, 'receiving');
});

test('tools are injectable, so Phase 5 wires a registry and not this module', () => {
  const withTool = buildLaunchIndex({
    tools: [{ toolKey: 'photos', label: 'Photo library', icon: () => null as never }],
  });
  const band = withTool.find((g) => g.id === 'tool');
  assert.ok(band, 'a non-empty tool list must produce a band');
  assert.equal(band!.rows[0]?.kind, 'tool');
  assert.equal(band!.rows[0]?.ref, 'photos');
});

test('typing a session name returns the session, not just its page', () => {
  const hits = search('unbox');
  assert.ok(hits.length > 0);
  assert.ok(
    hits.some((r) => r.kind === 'session' && r.ref === 'unbox'),
    'the Unbox SESSION must be among the hits, not only the receiving page',
  );
});

test('typing a table name returns the table', () => {
  const hits = search('orders');
  assert.ok(
    hits.some((r) => r.kind === 'table' && r.ref === 'orders'),
    'the Orders grid must be reachable by its own name',
  );
});

test('the scan vocabulary is searchable even though no label says it', () => {
  // An operator says "arrival", not "triage" — the scan type rides as a keyword.
  const hits = search('triage');
  assert.ok(hits.some((r) => r.kind === 'session' && r.ref === 'triage'));

  const scanned = search('scan pack');
  assert.ok(
    scanned.some((r) => r.kind === 'session' && r.ref === 'pack'),
    '"scan pack" must reach the Pack scan session',
  );
});

test('bands keep their order while typing; ranking happens inside them', () => {
  const restOrder = INDEX.map((g) => g.id);
  const typedOrder = filterLaunchIndex(INDEX, 'e').map((g) => g.id);
  // Filtering may DROP a band, never reorder the survivors.
  let cursor = 0;
  for (const id of typedOrder) {
    const at = restOrder.indexOf(id, cursor);
    assert.ok(at >= 0, `band ${id} moved or vanished from the browse order`);
    cursor = at + 1;
  }
});

test('an empty query is the browse face — every row, no ranking', () => {
  const resting = filterLaunchIndex(INDEX, '');
  assert.equal(launchCursorRows(resting).length, ROWS.length);
  assert.ok(
    resting.every((g) => g.hits.every((h) => h.ranges.length === 0)),
    'nothing is highlighted when nothing was typed',
  );
});

test('a label match carries the offsets to mark', () => {
  const hits = filterLaunchIndex(INDEX, 'unbox');
  const marked = hits.flatMap((g) => g.hits).filter((h) => h.ranges.length > 0);
  assert.ok(
    marked.length > 0,
    'the launcher keeps match ranges — the palette drops them only because its row has nowhere to put them',
  );
});

test('isTabLaunch splits the index exactly along page vs tab', () => {
  const tabs = ROWS.filter(isTabLaunch);
  const pages = ROWS.filter((r) => !isTabLaunch(r));

  assert.equal(tabs.length + pages.length, ROWS.length);
  assert.ok(tabs.every((r) => r.kind !== 'page'));
  assert.ok(pages.every((r) => r.kind === undefined));
  // The narrowing is the point: `ref` is a plain string on the tab side, so
  // `openTab` needs no re-check at the call site.
  assert.ok(tabs.every((r) => r.ref.length > 0));
});

test('row ids are unique across the whole index', () => {
  const ids = ROWS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});
