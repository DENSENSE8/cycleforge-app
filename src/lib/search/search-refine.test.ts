import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import {
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
