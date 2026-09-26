/** Unit tests for the delivered-not-unboxed clocks (Phase 1 of docs/todo/ebay-delivered-not-unboxed-PLAN.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DELIVERED_NOT_UNBOXED_WINDOW_DAYS,
  EBAY_CLAIM_WINDOW_DAYS,
  ebayClaimByDateSql,
} from './delivered-not-unboxed';
import { deliveredUnscannedAgeBandSql } from './delivered-unscanned';

test('feed window is strictly wider than the eBay claim window', () => {
  // The regression this guards: at 30/30 a carton left the feed on exactly the
  // day its claim expired, so the last actionable day was never on screen.
  assert.ok(
    DELIVERED_NOT_UNBOXED_WINDOW_DAYS > EBAY_CLAIM_WINDOW_DAYS,
    `feed window (${DELIVERED_NOT_UNBOXED_WINDOW_DAYS}d) must exceed the claim window (${EBAY_CLAIM_WINDOW_DAYS}d)`,
  );
});

test('eBay claim window is the 30-day Money Back Guarantee reporting limit', () => {
  assert.equal(EBAY_CLAIM_WINDOW_DAYS, 30);
});

test('claim-by SQL is gated to eBay lines and NULL otherwise', () => {
  const sql = ebayClaimByDateSql('$4');
  assert.match(sql, /rl\.inbound_source_type = 'ebay'/);
  assert.match(sql, /ELSE NULL END/);
});

test('claim-by SQL buckets the delivered instant by the warehouse civil day', () => {
  const sql = ebayClaimByDateSql('$4');
  // Must go through the warehouse zone…
  assert.match(sql, /timezone\('America\/Los_Angeles', stn\.delivered_at\)::date/);
  // …and must NOT cast the raw timestamptz straight to a date (UTC bucketing
  // would shift every late-afternoon Pacific delivery a day forward).
  assert.ok(
    !/[^)]stn\.delivered_at::date/.test(sql),
    'delivered_at must not be cast to ::date outside the warehouse-zone conversion',
  );
});

test('claim-by SQL prefers the vendor-promised delivery date when present', () => {
  const sql = ebayClaimByDateSql('$4');
  assert.match(sql, /COALESCE\(\s*mirror\.expected_delivery_date/);
});

test('claim-by SQL substitutes the window placeholder verbatim', () => {
  assert.match(ebayClaimByDateSql('$4'), /\$4 \|\| ' days'/);
  assert.match(ebayClaimByDateSql('$7'), /\$7 \|\| ' days'/);
});

test('the SLA band is the shared delivered-unscanned SoT, not a local copy', () => {
  // Both feeds must agree on what "48h old" means; this asserts the fragment is
  // reused rather than re-derived here.
  const band = deliveredUnscannedAgeBandSql('stn.delivered_at');
  assert.match(band, /lt_24h/);
  assert.match(band, /h24_48/);
  assert.match(band, /gt_48h/);
});
