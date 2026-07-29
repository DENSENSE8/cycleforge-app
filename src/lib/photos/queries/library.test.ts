import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPoFinderKind,
  libraryFiltersFromSearchParams,
} from '@/lib/photos/queries/library';

// Pure URL→filters layer only (the SQL builder needs a DB). Shared by
// /api/photos/library and /api/photos/library/ids, so the parse contract is
// what keeps the two endpoints from drifting.

test('libraryFiltersFromSearchParams parses the unboxing stage sub-filter', () => {
  const filters = libraryFiltersFromSearchParams(
    new URLSearchParams('stage=unbox_carton&sourceScope=unboxing'),
  );
  assert.equal(filters.stage, 'unbox_carton');
});

test('libraryFiltersFromSearchParams rejects unknown or non-receiving stages', () => {
  assert.equal(
    libraryFiltersFromSearchParams(new URLSearchParams('stage=bogus')).stage,
    null,
  );
  // testing/packing are evidence stages but not library sub-filters (they have
  // their own sidebar folders) — the receiving-stage guard drops them.
  assert.equal(
    libraryFiltersFromSearchParams(new URLSearchParams('stage=testing')).stage,
    null,
  );
});

test('sku finder kind parses and the sku business-id filter passes through', () => {
  const filters = libraryFiltersFromSearchParams(
    new URLSearchParams('poFinder=WM-1023&poFinderKind=sku&sku=WM-1023'),
  );
  assert.equal(filters.poFinder, 'WM-1023');
  assert.equal(filters.poFinderKind, 'sku');
  assert.equal(filters.sku, 'WM-1023');
  assert.equal(isPoFinderKind('sku'), true);
  assert.equal(isPoFinderKind('bogus'), false);
});
