import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groupHitsForPreview, flattenPreviewGroups } from './search-tabs';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

function hit(entityType: string, id: number): AiSearchHit {
  return {
    id,
    entityType,
    title: `${entityType} ${id}`,
    subtitle: '',
    href: `/x/${id}`,
    matchField: 'keyword',
    score: 1,
  };
}

test('groupHitsForPreview: orders first, per-group + total caps respected', () => {
  const hits = [
    hit('unit', 1),
    hit('order', 2),
    hit('order', 3),
    hit('order', 4),
    hit('unit', 5),
    hit('sku', 6),
  ];
  const groups = groupHitsForPreview(hits, { perGroup: 2, total: 8 });
  // Orders lead regardless of source order; each group capped at 2.
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Orders', 'Units', 'SKUs'],
  );
  assert.deepEqual(
    groups.map((g) => g.hits.length),
    [2, 2, 1],
  );
  // Flatten preserves the grouped display order (what keyboard nav walks).
  assert.deepEqual(
    flattenPreviewGroups(groups).map((h) => `${h.entityType}:${h.id}`),
    ['order:2', 'order:3', 'unit:1', 'unit:5', 'sku:6'],
  );
});

test('groupHitsForPreview: import_exception and exception share the Exceptions group', () => {
  const hits = [hit('import_exception', 100), hit('exception', 2886), hit('order', 1)];
  const groups = groupHitsForPreview(hits, { perGroup: 2, total: 8 });
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Orders', 'Exceptions'],
  );
  assert.deepEqual(
    flattenPreviewGroups(groups).map((h) => `${h.entityType}:${h.id}`),
    ['order:1', 'import_exception:100', 'exception:2886'],
  );
});

test('groupHitsForPreview: total cap drops trailing groups', () => {
  const hits = [hit('order', 1), hit('order', 2), hit('unit', 3), hit('sku', 4)];
  const groups = groupHitsForPreview(hits, { perGroup: 2, total: 3 });
  const flat = flattenPreviewGroups(groups);
  assert.equal(flat.length, 3); // 2 orders + 1 unit, sku dropped
  assert.deepEqual(
    flat.map((h) => h.entityType),
    ['order', 'order', 'unit'],
  );
});
