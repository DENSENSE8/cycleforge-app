/**
 * Guard tests for seller-only Fulfillment sync predicates (DB-free).
 * Run: npx tsx --test src/lib/ebay/credentials-role.test.ts
 */
import { test } from 'node:test';
import { ok, match, equal, deepEqual } from 'node:assert/strict';
import { EBAY_PLATFORM_PREDICATE, EBAY_SELLER_ROLE_PREDICATE } from './account-predicates';
import { ebayScopeForAccount, ebayScopeStringForRole, normalizeEbayRole, parseEbayAccountScope } from './oauth-config';

test('EBAY_SELLER_ROLE_PREDICATE includes legacy NULL and seller, excludes buyer', () => {
  ok(EBAY_SELLER_ROLE_PREDICATE.includes("account_role IS NULL"));
  ok(EBAY_SELLER_ROLE_PREDICATE.includes("account_role = 'seller'"));
  // Must not match buyer rows when AND'd into seller sync queries.
  ok(!EBAY_SELLER_ROLE_PREDICATE.includes("'buyer'"));
});

test('EBAY_PLATFORM_PREDICATE still scopes to eBay (not Zoho dual-use rows)', () => {
  match(EBAY_PLATFORM_PREDICATE, /platform = 'EBAY'/);
});

test('buyer refresh scopes never include sell.* (EbayClient / hourly job contract)', () => {
  const buyer = ebayScopeStringForRole(normalizeEbayRole('buyer'));
  ok(!buyer.includes('/sell.'), `buyer scopes leaked sell: ${buyer}`);
  const seller = ebayScopeStringForRole(normalizeEbayRole('seller'));
  ok(seller.includes('/sell.') || seller.includes('api_scope'), `seller scopes unexpected: ${seller}`);
});

test('ebayScopeForAccount uses seller: / buyer: prefixes (no bare slug collision)', () => {
  equal(ebayScopeForAccount('seller', 'USAV'), 'seller:USAV');
  equal(ebayScopeForAccount('buyer', 'USAV'), 'buyer:USAV');
  deepEqual(parseEbayAccountScope('buyer:Purchasing'), { role: 'buyer', accountSlug: 'Purchasing' });
  equal(parseEbayAccountScope('USAV'), null);
});
