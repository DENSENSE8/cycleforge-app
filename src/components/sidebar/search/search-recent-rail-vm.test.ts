import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSearchRecentSelectedId,
  searchRecentMatchesFilter,
  searchRecentMeta,
  searchRecentRowId,
  searchRecentSelection,
  searchRecentStatusDot,
  searchRecentTitle,
} from './search-recent-rail-vm';
import type { SearchRecentEntry } from '@/lib/search/search-recents';

function entry(over: Partial<SearchRecentEntry> = {}): SearchRecentEntry {
  return {
    id: '101',
    query: '0325-11223',
    scope: 'global',
    timestamp: '2026-08-20T10:00:00.000Z',
    ...over,
  };
}

test('a recent that resolved to a record exposes its ?sel= selection', () => {
  const row = entry({
    topHit: { title: 'Shimano Deore XT', href: '/search?q=x&sel=order%3A4210', entityType: 'order' },
  });
  assert.deepEqual(searchRecentSelection(row), { entityType: 'order', id: 4210 });
  assert.equal(searchRecentTitle(row), 'Shimano Deore XT');
  // Title is the record, so the typed query drops to the secondary line.
  assert.equal(searchRecentMeta(row), '0325-11223');
});

test('a query-only recent has no selection and titles with the query', () => {
  const row = entry({ scopeHref: '/search?q=brake+pads', query: 'brake pads' });
  assert.equal(searchRecentSelection(row), null);
  assert.equal(searchRecentTitle(row), 'brake pads');
  assert.notEqual(searchRecentStatusDot(row), searchRecentStatusDot(
    entry({ topHit: { title: 'X', href: '/search?sel=order%3A1', entityType: 'order' } }),
  ));
});

test('a malformed href never fabricates a selection', () => {
  assert.equal(searchRecentSelection(entry({ scopeHref: '/search' })), null);
  assert.equal(searchRecentSelection(entry({ scopeHref: '' })), null);
  assert.equal(
    searchRecentSelection(entry({ scopeHref: '/search?sel=notatype%3Aabc' })),
    null,
  );
});

test('row ids are numeric and stable for uuid-keyed localStorage entries', () => {
  assert.equal(searchRecentRowId(entry({ id: '42' })), 42);
  const uuid = 'b3f1c2d4-0000-4000-8000-000000000001';
  const first = searchRecentRowId(entry({ id: uuid }));
  assert.equal(first, searchRecentRowId(entry({ id: uuid })));
  assert.ok(Number.isInteger(first) && first > 0);
});

test('an active ?sel= wins over a query match when picking the current row', () => {
  const rows = [
    entry({ id: '1', query: 'brake pads' }),
    entry({
      id: '2',
      query: 'other',
      topHit: { title: 'Order', href: '/search?sel=order%3A99', entityType: 'order' },
    }),
  ];
  assert.equal(
    resolveSearchRecentSelectedId(rows, { entityType: 'order', id: 99 }, 'brake pads'),
    2,
  );
  // No selection → fall back to the query match.
  assert.equal(resolveSearchRecentSelectedId(rows, null, 'brake pads'), 1);
  assert.equal(resolveSearchRecentSelectedId(rows, null, ''), null);
});

test('the rail filter matches the record title AND the typed query', () => {
  const row = entry({
    query: 'SN-ABC-99871',
    topHit: { title: 'Shimano Deore XT', href: '/search?sel=unit%3A5150', entityType: 'unit' },
  });
  assert.equal(searchRecentMatchesFilter(row, ''), true, 'empty filter keeps everything');
  assert.equal(searchRecentMatchesFilter(row, '  '), true);
  assert.equal(searchRecentMatchesFilter(row, 'shimano'), true, 'by title');
  assert.equal(searchRecentMatchesFilter(row, 'abc-998'), true, 'by the typed query');
  assert.equal(searchRecentMatchesFilter(row, 'unit'), true, 'by entity type');
  assert.equal(searchRecentMatchesFilter(row, 'campagnolo'), false);
});

test('the secondary line is never the scope label', () => {
  // Regression (2026-08-21): `searchRecentMeta` fell back to `entry.scopeLabel`,
  // a persisted column, so 89 dogfood rows carrying a retired path's `Search`
  // label painted that word under every rail row. The Unbox rail's second line
  // is the record's own facts — a scope bucket is not one.
  const queryOnly = entry({ scopeLabel: 'Search' });
  assert.equal(searchRecentMeta(queryOnly), null);

  const resolved = entry({
    scopeLabel: 'Search',
    topHit: { title: 'Shimano Deore XT', href: '/search?sel=order%3A1', entityType: 'order' },
  });
  assert.equal(searchRecentMeta(resolved), '0325-11223', 'the typed query, not the scope');

  // A title that IS the query leaves nothing to say — null, not a scope.
  assert.equal(
    searchRecentMeta(entry({
      scopeLabel: 'Everywhere',
      query: 'Shimano Deore XT',
      topHit: { title: 'Shimano Deore XT', href: '/search?sel=order%3A1', entityType: 'order' },
    })),
    null,
  );
});
