import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Catalog link-filter segments — keep in sync with
 * `linkFilterWhere` in src/lib/neon/sku-catalog-queries.ts and
 * `parseLinkFilter` in ProductsCatalogWorkspace.
 */
type LinkFilter = 'active_linked' | 'unlinked_pending' | 'all';

function parseLinkFilter(raw: string | null): LinkFilter {
  if (raw === 'unlinked_pending' || raw === 'all') return raw;
  return 'active_linked';
}

describe('Products Catalog linkFilter', () => {
  it('defaults to active_linked', () => {
    assert.equal(parseLinkFilter(null), 'active_linked');
    assert.equal(parseLinkFilter(''), 'active_linked');
    assert.equal(parseLinkFilter('bogus'), 'active_linked');
  });

  it('accepts unlinked_pending and all', () => {
    assert.equal(parseLinkFilter('unlinked_pending'), 'unlinked_pending');
    assert.equal(parseLinkFilter('all'), 'all');
  });
});
