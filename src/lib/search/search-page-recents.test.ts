import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  SEARCH_RECENTS_PAGE_HREF,
  desktopRecentOpenHref,
  searchRerunHref,
} from './search-page-recents';

describe('desktopRecentOpenHref', () => {
  it('remaps a mobile carton hit onto desktop search', () => {
    assert.equal(
      desktopRecentOpenHref({ query: 'R-99', topHit: { href: '/m/r/99' } }),
      '/search?sel=receiving:99',
    );
  });

  it('re-runs a typed query on /search when there is no hit href', () => {
    assert.equal(desktopRecentOpenHref({ query: '05-14897' }), searchRerunHref('05-14897'));
  });

  it('the recents landing itself is bare /search, never /m/', () => {
    assert.equal(SEARCH_RECENTS_PAGE_HREF, '/search');
    assert.ok(!SEARCH_RECENTS_PAGE_HREF.startsWith('/m/'));
  });
});
