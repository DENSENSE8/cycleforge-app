import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SEARCH_SKELETON_MIN,
  SEARCH_SKELETON_ROW_PX,
  searchSkeletonCount,
} from './search-result-grid';

describe('searchSkeletonCount', () => {
  it('returns the min floor before measure (height ≤ 0)', () => {
    assert.equal(searchSkeletonCount(0), SEARCH_SKELETON_MIN);
    assert.equal(searchSkeletonCount(-1), SEARCH_SKELETON_MIN);
  });

  it('returns the min when the pane is shorter than min × rowPx', () => {
    assert.equal(searchSkeletonCount(SEARCH_SKELETON_ROW_PX * 5), SEARCH_SKELETON_MIN);
    assert.equal(
      searchSkeletonCount(SEARCH_SKELETON_ROW_PX * SEARCH_SKELETON_MIN - 1),
      SEARCH_SKELETON_MIN,
    );
  });

  it('ceils height / rowPx once past the min floor', () => {
    assert.equal(
      searchSkeletonCount(SEARCH_SKELETON_ROW_PX * SEARCH_SKELETON_MIN),
      SEARCH_SKELETON_MIN,
    );
    assert.equal(searchSkeletonCount(SEARCH_SKELETON_ROW_PX * 11), 11);
    assert.equal(searchSkeletonCount(SEARCH_SKELETON_ROW_PX * 11 + 1), 12);
    assert.equal(searchSkeletonCount(640), Math.ceil(640 / SEARCH_SKELETON_ROW_PX));
  });
});
