/**
 * DB-free unit tests for the ⌘K page search.
 *
 * The ordering is the contract, not a nicety: "⌘K, type, Enter" is only safe
 * muscle memory if the same query always offers the same first row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_SIDEBAR_NAV, getSidebarNavItems } from '@/lib/sidebar-navigation';
import { searchNavPages } from './nav-page-search';

const ALL = APP_SIDEBAR_NAV;

test('"media" finds Media Library on the label', () => {
  const hits = searchNavPages(ALL, 'media');
  assert.equal(hits[0]?.id, 'ops-photos');
  assert.equal(hits[0]?.matchedOn, 'label');
  assert.equal(hits[0]?.href, '/ops/photos');
});

test('"photo" finds Media Library even though the label never says it', () => {
  // The whole reason `keywords` exists — staff call it "photos".
  const hits = searchNavPages(ALL, 'photo');
  const hit = hits.find((h) => h.id === 'ops-photos');
  assert.ok(hit, 'Media Library should be reachable by "photo"');
  assert.equal(hit.matchedOn, 'keyword');
});

test('"photo library" finds it too — the phrase staff actually say', () => {
  const hits = searchNavPages(ALL, 'photo library');
  assert.equal(hits[0]?.id, 'ops-photos');
});

test('"library" matches on a word boundary inside the label', () => {
  const hits = searchNavPages(ALL, 'library');
  assert.equal(hits[0]?.id, 'ops-photos');
  assert.equal(hits[0]?.matchedOn, 'label');
});

test('an exact label beats a prefix beats a keyword', () => {
  const items = [
    { id: 'kw', label: 'Unrelated', href: '/kw', icon: (() => null) as never, kind: 'top' as const, keywords: ['media'] },
    { id: 'contains', label: 'Social Media Planner', href: '/c', icon: (() => null) as never, kind: 'top' as const },
    { id: 'exact', label: 'Media', href: '/m', icon: (() => null) as never, kind: 'top' as const },
  ];
  assert.deepEqual(
    searchNavPages(items, 'media').map((h) => h.id),
    ['exact', 'contains', 'kw'],
  );
});

test('a one-character query returns nothing — it would bury the record hits', () => {
  assert.deepEqual(searchNavPages(ALL, 'm'), []);
  assert.deepEqual(searchNavPages(ALL, '  '), []);
});

test('ties break on registry order, so the first row never wobbles', () => {
  const icon = (() => null) as never;
  const items = [
    { id: 'second', label: 'Ship Later', href: '/b', icon, kind: 'top' as const },
    { id: 'first', label: 'Ship Now', href: '/a', icon, kind: 'top' as const },
  ];
  // Both score identically (label prefix); registry order decides.
  assert.deepEqual(searchNavPages(items, 'ship').map((h) => h.id), ['second', 'first']);
});

test('respects the caller\'s permission filtering — it never reaches for the raw registry', () => {
  // Media Library needs photos.view. A user without it must not see the page
  // advertised in the palette.
  const withoutPhotos = getSidebarNavItems({ permissions: new Set<string>() });
  assert.deepEqual(
    searchNavPages(withoutPhotos, 'media').map((h) => h.id),
    [],
  );
  const withPhotos = getSidebarNavItems({ permissions: new Set(['photos.view']) });
  assert.equal(searchNavPages(withPhotos, 'media')[0]?.id, 'ops-photos');
});

test('the limit is honoured', () => {
  assert.ok(searchNavPages(ALL, 'e', 3).length <= 3);
  assert.ok(searchNavPages(ALL, 'ship', 1).length <= 1);
});
