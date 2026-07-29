/**
 * `/dashboard` domain axis + the retired-Search-mode redirect contract.
 *
 * The redirect table is the load-bearing part: `?mode=search` was a real,
 * bookmarkable surface, so every shape it could carry has to land somewhere
 * honest rather than 404-ing or silently dropping the operator's query.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDashboardDomainFromSearch,
  isRetiredSearchMode,
  retiredSearchModeTarget,
} from './dashboard-domains';

const sp = (qs: string) => new URLSearchParams(qs);

test('domain: two values, with the legacy `receiving` alias folding into inbound', () => {
  assert.equal(getDashboardDomainFromSearch(sp('')), 'outbound');
  assert.equal(getDashboardDomainFromSearch(sp('unshipped=')), 'outbound');
  assert.equal(getDashboardDomainFromSearch(sp('shipped=')), 'outbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=inbound')), 'inbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=receiving')), 'inbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=INBOUND')), 'inbound');
  // A retired / unknown mode is not a third domain — it falls to the default.
  assert.equal(getDashboardDomainFromSearch(sp('mode=search')), 'outbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=nonsense')), 'outbound');
});

test('isRetiredSearchMode: only the exact retired value', () => {
  assert.equal(isRetiredSearchMode(sp('mode=search')), true);
  assert.equal(isRetiredSearchMode(sp('mode=SEARCH')), true);
  assert.equal(isRetiredSearchMode(sp('mode=inbound')), false);
  assert.equal(isRetiredSearchMode(sp('')), false);
  // `?q=` alone is NOT search mode — the outbound board has its own search.
  assert.equal(isRetiredSearchMode(sp('q=abc')), false);
});

test('retiredSearchModeTarget: an open order wins, then the query, then the default', () => {
  // A selected order goes to its ONE shell, never back to a search surface.
  assert.equal(
    retiredSearchModeTarget(sp('mode=search&openOrderId=42&map=search&q=x')),
    '/o/42',
  );
  assert.equal(
    retiredSearchModeTarget(sp('mode=search&openOrderId=111-6350504-7603458')),
    '/o/111-6350504-7603458',
  );
  // Query only → the cross-entity route, query preserved and re-encoded.
  assert.equal(
    retiredSearchModeTarget(sp('mode=search&q=05-14897-15602')),
    '/search?q=05-14897-15602',
  );
  assert.equal(retiredSearchModeTarget(sp('mode=search&q=a b/c')), '/search?q=a%20b%2Fc');
  // `dq` was the alternate query key the old view accepted; it must not be lost.
  assert.equal(retiredSearchModeTarget(sp('mode=search&dq=bose')), '/search?q=bose');
  // Bare → the dashboard's default domain.
  assert.equal(retiredSearchModeTarget(sp('mode=search')), '/dashboard');
  assert.equal(retiredSearchModeTarget(sp('mode=search&map=recent')), '/dashboard');
  // Whitespace-only params are not a query.
  assert.equal(retiredSearchModeTarget(sp('mode=search&q=%20%20')), '/dashboard');
});
