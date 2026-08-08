/**
 * `/dashboard` domain axis + the retired-front-door redirect contracts.
 *
 * The redirect tables are load-bearing: `?mode=search`, `?fba`, and `/walk-in`
 * were bookmarkable surfaces, so every shape they could carry has to land
 * somewhere honest rather than 404-ing or silently dropping the operator's query.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FBA_OUTBOUND_PATH } from '@/lib/fba/fba-modes';
import {
  getDashboardDomainFromSearch,
  isRetiredFbaView,
  isRetiredSearchMode,
  retiredFbaViewTarget,
  retiredSearchModeTarget,
  retiredWalkInHistoryTarget,
} from './dashboard-domains';

const sp = (qs: string) => new URLSearchParams(qs);

test('domain: outbound | inbound | sales, with aliases', () => {
  assert.equal(getDashboardDomainFromSearch(sp('')), 'outbound');
  assert.equal(getDashboardDomainFromSearch(sp('unshipped=')), 'outbound');
  assert.equal(getDashboardDomainFromSearch(sp('shipped=')), 'outbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=inbound')), 'inbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=receiving')), 'inbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=INBOUND')), 'inbound');
  assert.equal(getDashboardDomainFromSearch(sp('mode=sales')), 'sales');
  assert.equal(getDashboardDomainFromSearch(sp('mode=pickup')), 'sales');
  assert.equal(getDashboardDomainFromSearch(sp('mode=repairs')), 'sales');
  // A retired / unknown mode is not a fourth domain — it falls to the default.
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
  // A selected order goes to search order feedback.
  assert.equal(
    retiredSearchModeTarget(sp('mode=search&openOrderId=42&map=search&q=x')),
    '/search?sel=order:42',
  );
  assert.equal(
    retiredSearchModeTarget(sp('mode=search&openOrderId=111-6350504-7603458')),
    '/search?sel=order:111-6350504-7603458',
  );
  // Query only → the cross-entity route, query preserved and re-encoded.
  assert.equal(
    retiredSearchModeTarget(sp('mode=search&q=05-14897-15602')),
    '/search?q=05-14897-15602',
  );
  assert.equal(retiredSearchModeTarget(sp('mode=search&q=a b/c')), '/search?q=a%20b%2Fc');
  // `dq` was the alternate query key the old view accepted; it must not be lost.
  assert.equal(retiredSearchModeTarget(sp('mode=search&dq=bose')), '/search?q=bose');
  // Bare → To-ship desk (outbound left `/dashboard` for `/shipping/orders`).
  assert.equal(retiredSearchModeTarget(sp('mode=search')), '/shipping/orders');
  assert.equal(retiredSearchModeTarget(sp('mode=search&map=recent')), '/shipping/orders');
  // Whitespace-only params are not a query.
  assert.equal(retiredSearchModeTarget(sp('mode=search&q=%20%20')), '/shipping/orders');
});

test('a retired ?fba bookmark redirects to FBA\'s real home, not the Pending tab', () => {
  // Row L deleted `'fba'` from DashboardOrderView. Without this redirect the
  // bookmark fell THROUGH to Pending — neither of the outcomes the plan weighed,
  // and a silent discard of what the operator asked for.
  assert.equal(isRetiredFbaView(new URLSearchParams('fba')), true);
  assert.equal(isRetiredFbaView(new URLSearchParams('fba=')), true);
  assert.equal(isRetiredFbaView(new URLSearchParams('shipped')), false);
  assert.equal(isRetiredFbaView(new URLSearchParams('')), false);

  // The target is the FBA path SoT, never a hardcoded string, and it carries
  // nothing: `?open=` here is an ORDER id while the board's `openShipmentId` is a
  // SHIPMENT id, so forwarding it would focus an unrelated record.
  assert.equal(retiredFbaViewTarget(), FBA_OUTBOUND_PATH);
  assert.ok(!retiredFbaViewTarget().includes('?'));
});

test('retiredWalkInHistoryTarget: Sales / Local Pickup / Repairs land on the dashboard domain', () => {
  assert.equal(retiredWalkInHistoryTarget(sp('')), '/dashboard?mode=sales');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=sales')), '/dashboard?mode=sales');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=pickup')), '/dashboard?mode=pickup');
  assert.equal(retiredWalkInHistoryTarget(sp('category=pickups')), '/dashboard?mode=pickup');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=repairs')), '/dashboard?mode=repairs');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=repair')), '/dashboard?mode=repairs');
  assert.equal(retiredWalkInHistoryTarget(sp('category=repairs')), '/dashboard?mode=repairs');
  // Non-default tabs survive; defaults drop.
  assert.equal(retiredWalkInHistoryTarget(sp('mode=sales&tab=all')), '/dashboard?mode=sales&tab=all');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=sales&tab=today')), '/dashboard?mode=sales');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=pickup&tab=draft')), '/dashboard?mode=pickup&tab=draft');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=pickup&tab=completed')), '/dashboard?mode=pickup');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=repairs&tab=active')), '/dashboard?mode=repairs&tab=active');
  assert.equal(retiredWalkInHistoryTarget(sp('mode=repairs&tab=done')), '/dashboard?mode=repairs');
});
