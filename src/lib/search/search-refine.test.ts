import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import {
  activeSearchRefineCount,
  applySearchDisplaySort,
  applySearchEtype,
  applySearchHstat,
  clearSearchRefine,
  parseSearchDisplaySort,
  parseSearchEtype,
  parseSearchHstat,
  refineSearchHits,
  sortSearchHits,
  statusOptionsFromHits,
  parseSearchChan,
  applySearchChan,
  channelOptionsFromHits,
  searchEntityCounts,
} from '@/lib/search/search-refine';

function hit(
  partial: Partial<AiSearchHit> & Pick<AiSearchHit, 'id' | 'entityType'>,
): AiSearchHit {
  return {
    title: `T${partial.id}`,
    subtitle: '',
    href: '/',
    matchField: 'x',
    score: 1,
    ...partial,
  };
}

test('parseSearchEtype accepts UI entity types only', () => {
  assert.equal(parseSearchEtype('order'), 'order');
  assert.equal(parseSearchEtype('UNIT'), 'unit');
  assert.equal(parseSearchEtype('nope'), null);
  assert.equal(parseSearchEtype(null), null);
});

test('parseSearchHstat trims; empty → null', () => {
  assert.equal(parseSearchHstat('  Shipped  '), 'Shipped');
  assert.equal(parseSearchHstat(''), null);
  assert.equal(parseSearchHstat(null), null);
});

test('parseSearchDisplaySort defaults to relevance', () => {
  assert.equal(parseSearchDisplaySort(null), 'relevance');
  assert.equal(parseSearchDisplaySort('relevance'), 'relevance');
  assert.equal(parseSearchDisplaySort('date'), 'date');
  assert.equal(parseSearchDisplaySort('received_at'), 'relevance');
});

test('refineSearchHits filters by etype and hstat', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { status: 'Shipped' } }),
    hit({ id: 2, entityType: 'receiving', facets: { status: 'PENDING' } }),
    hit({ id: 3, entityType: 'order', facets: { status: 'Pending' } }),
  ];
  assert.equal(refineSearchHits(hits, { etype: 'order' }).length, 2);
  assert.deepEqual(
    refineSearchHits(hits, { etype: 'order', hstat: 'Shipped' }).map((h) => h.id),
    [1],
  );
  assert.deepEqual(refineSearchHits(hits, {}).map((h) => h.id), [1, 2, 3]);
});

test('sortSearchHits date desc keeps nulls last and is stable', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { happened_at: '2026-01-01T00:00:00.000Z' } }),
    hit({ id: 2, entityType: 'order', facets: {} }),
    hit({ id: 3, entityType: 'order', facets: { happened_at: '2026-06-01T00:00:00.000Z' } }),
    hit({ id: 4, entityType: 'order', facets: { happened_at: '2026-06-01T00:00:00.000Z' } }),
  ];
  assert.deepEqual(
    sortSearchHits(hits, 'date').map((h) => h.id),
    [3, 4, 1, 2],
  );
  assert.deepEqual(
    sortSearchHits(hits, 'relevance').map((h) => h.id),
    [1, 2, 3, 4],
  );
});

test('statusOptionsFromHits is unique and preserves first-seen order', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { status: 'Shipped' } }),
    hit({ id: 2, entityType: 'order', facets: { status: 'Pending' } }),
    hit({ id: 3, entityType: 'order', facets: { status: 'Shipped' } }),
    hit({ id: 4, entityType: 'order', facets: {} }),
  ];
  assert.deepEqual(statusOptionsFromHits(hits), ['Shipped', 'Pending']);
});

test('URL mutators write etype/hstat/colsort correctly', () => {
  const params = new URLSearchParams('q=bose');
  applySearchEtype(params, 'order');
  applySearchHstat(params, 'Shipped');
  applySearchDisplaySort(params, 'date');
  assert.equal(params.get('etype'), 'order');
  assert.equal(params.get('hstat'), 'Shipped');
  assert.equal(params.get('colsort'), 'date');

  applySearchDisplaySort(params, 'relevance');
  assert.equal(params.get('colsort'), null);

  clearSearchRefine(params);
  assert.equal(params.get('etype'), null);
  assert.equal(params.get('hstat'), null);
  assert.equal(params.get('q'), 'bose');
});

// ── channel refine (?chan=) ─────────────────────────────────────────────────

test('parseSearchChan lowercases the stored value; empty → null', () => {
  assert.equal(parseSearchChan('  eBay '), 'ebay');
  assert.equal(parseSearchChan('AMAZON'), 'amazon');
  assert.equal(parseSearchChan(''), null);
  assert.equal(parseSearchChan(null), null);
});

test('channelOptionsFromHits lists each channel once, in first-seen order', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { source_platform: 'ebay' } }),
    hit({ id: 2, entityType: 'order', facets: { source_platform: 'amazon' } }),
    hit({ id: 3, entityType: 'order', facets: { source_platform: 'eBay' } }),
    hit({ id: 4, entityType: 'sku', facets: { source_platform: null } }),
    hit({ id: 5, entityType: 'repair' }),
  ];
  assert.deepEqual(channelOptionsFromHits(hits), ['ebay', 'amazon']);
});

test('refineSearchHits filters by channel, case-insensitively', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { source_platform: 'ebay' } }),
    hit({ id: 2, entityType: 'order', facets: { source_platform: 'Amazon' } }),
  ];
  assert.deepEqual(refineSearchHits(hits, { chan: 'amazon' }).map((h) => h.id), [2]);
});

test('a hit with no channel is excluded once a channel filter is on', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { source_platform: 'ebay' } }),
    hit({ id: 2, entityType: 'repair' }),
  ];
  assert.deepEqual(refineSearchHits(hits, { chan: 'ebay' }).map((h) => h.id), [1]);
});

test('channel composes with type and status rather than replacing them', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { source_platform: 'ebay', status: 'Shipped' } }),
    hit({ id: 2, entityType: 'order', facets: { source_platform: 'ebay', status: 'Returned' } }),
    hit({ id: 3, entityType: 'unit', facets: { source_platform: 'ebay', status: 'Shipped' } }),
  ];
  const out = refineSearchHits(hits, { etype: 'order', hstat: 'Shipped', chan: 'ebay' });
  assert.deepEqual(out.map((h) => h.id), [1]);
});

test('no channel filter leaves the set untouched', () => {
  const hits = [hit({ id: 1, entityType: 'order' })];
  assert.equal(refineSearchHits(hits, { chan: null }).length, 1);
});

test('applySearchChan sets and clears the key', () => {
  const p = new URLSearchParams();
  applySearchChan(p, 'eBay');
  assert.equal(p.get('chan'), 'ebay', 'stored lowercase so a deep link is stable');
  applySearchChan(p, null);
  assert.equal(p.get('chan'), null);
});

test('clearSearchRefine drops the channel too — "Clear filters" must clear all', () => {
  const p = new URLSearchParams('etype=order&hstat=Shipped&chan=ebay&q=keep');
  clearSearchRefine(p);
  assert.equal(p.get('chan'), null);
  assert.equal(p.get('etype'), null);
  assert.equal(p.get('hstat'), null);
  assert.equal(p.get('q'), 'keep', 'the query itself is not a refine');
});

// ── collapsed-trigger tally (phone refine sheet) ─────────────────────────────

test('activeSearchRefineCount counts each live narrowing key once', () => {
  assert.equal(activeSearchRefineCount(new URLSearchParams('q=bose')), 0);
  assert.equal(activeSearchRefineCount(new URLSearchParams('etype=order')), 1);
  assert.equal(
    activeSearchRefineCount(new URLSearchParams('etype=order&hstat=Shipped&chan=ebay')),
    3,
  );
});

test('activeSearchRefineCount ignores sort — re-ordering is not narrowing', () => {
  assert.equal(activeSearchRefineCount(new URLSearchParams('colsort=date')), 0);
  assert.equal(
    activeSearchRefineCount(new URLSearchParams('etype=order&colsort=date')),
    1,
    'a sorted, type-scoped list is narrowed once',
  );
});

test('activeSearchRefineCount rejects junk the parsers reject', () => {
  assert.equal(
    activeSearchRefineCount(new URLSearchParams('etype=not_a_type&hstat=%20&chan=')),
    0,
    'a key the refine cannot apply must not inflate the trigger',
  );
});

test('activeSearchRefineCount reads zero after clearSearchRefine', () => {
  const p = new URLSearchParams('etype=order&hstat=Shipped&chan=ebay&q=keep');
  clearSearchRefine(p);
  assert.equal(activeSearchRefineCount(p), 0);
});

// ── scope-cluster counts (browse toolbar pills) ─────────────────────────────

test('searchEntityCounts tallies every UI type and zero-fills the rest', () => {
  const counts = searchEntityCounts([
    hit({ id: 1, entityType: 'order' }),
    hit({ id: 2, entityType: 'order' }),
    hit({ id: 3, entityType: 'unit' }),
  ]);
  assert.equal(counts.total, 3);
  assert.deepEqual(counts.byType, {
    order: 2,
    unit: 1,
    receiving: 0,
    sku: 0,
    repair: 0,
    fba: 0,
    warranty: 0,
    ticket: 0,
    location: 0,
  });
});

test('searchEntityCounts narrows by status and channel but never by etype', () => {
  const hits = [
    hit({ id: 1, entityType: 'order', facets: { status: 'Shipped', source_platform: 'eBay' } }),
    hit({ id: 2, entityType: 'order', facets: { status: 'Open', source_platform: 'eBay' } }),
    hit({ id: 3, entityType: 'unit', facets: { status: 'Shipped', source_platform: 'amazon' } }),
    hit({ id: 4, entityType: 'unit', facets: { status: 'Shipped', source_platform: 'eBay' } }),
  ];
  const counts = searchEntityCounts(hits, { hstat: 'Shipped', chan: 'ebay' });
  // A scope pill must keep answering "what would picking me show?" while the
  // other facets are on — so orders stay visible even though unit is 2x.
  assert.equal(counts.byType.order, 1);
  assert.equal(counts.byType.unit, 1);
  assert.equal(counts.total, 2);
});

test('searchEntityCounts counts an unknown wire type in total only', () => {
  const counts = searchEntityCounts([
    hit({ id: 1, entityType: 'import_exception' as never }),
    hit({ id: 2, entityType: 'sku' }),
  ]);
  assert.equal(counts.total, 2);
  assert.equal(counts.byType.sku, 1);
  assert.equal(
    Object.values(counts.byType).reduce((a, b) => a + b, 0),
    1,
    'no scope pill claims a type it cannot filter to',
  );
});
