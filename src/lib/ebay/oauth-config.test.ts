/**
 * Unit tests for the eBay OAuth scope/environment single source of truth.
 * Runs with the existing `tsx --test` harness — no extra deps, no DB.
 */
import { test, afterEach } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  ebayScopes,
  ebayScopeString,
  ebayBuyerScopes,
  ebayScopeStringForRole,
  normalizeEbayRole,
  normalizeEbayEnvironment,
  isEbaySandbox,
  ebayAuthDomain,
  ebayTokenEndpoint,
  ebayIdentityEndpoint,
  probeEbayOauthAuthorizeConfig,
} from './oauth-config';

afterEach(() => {
  delete process.env.EBAY_SCOPES;
  delete process.env.EBAY_BUYER_SCOPES;
});

test('default scopes are the minimal seller-copilot set (no sell.finances)', () => {
  delete process.env.EBAY_SCOPES;
  const scopes = ebayScopes();
  ok(scopes.includes('https://api.ebay.com/oauth/api_scope'));
  ok(scopes.includes('https://api.ebay.com/oauth/api_scope/sell.inventory'));
  ok(scopes.includes('https://api.ebay.com/oauth/api_scope/sell.fulfillment'));
  ok(scopes.includes('https://api.ebay.com/oauth/api_scope/sell.account'));
  ok(!scopes.some((s) => s.endsWith('/sell.finances')), 'sell.finances must be opt-in');
});

test('EBAY_SCOPES overrides the default set (space-separated)', () => {
  process.env.EBAY_SCOPES =
    'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.finances';
  deepStrictEqual(ebayScopes(), [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
  ]);
});

test('blank EBAY_SCOPES falls back to defaults', () => {
  process.env.EBAY_SCOPES = '   ';
  ok(ebayScopes().length >= 4);
});

test('ebayScopeString joins with a single space', () => {
  process.env.EBAY_SCOPES = 'a b';
  strictEqual(ebayScopeString(), 'a b');
});

test('buyer scopes default to the base api_scope only; buy.order.readonly is opt-in', () => {
  delete process.env.EBAY_BUYER_SCOPES;
  const buyer = ebayBuyerScopes();
  // Base scope is always present and is sufficient for Trading-API purchase discovery.
  ok(buyer.includes('https://api.ebay.com/oauth/api_scope'));
  // RESTRICTED scope is NOT requested by default — like the seller default excludes
  // sell.finances, requesting an unapproved scope fails consent and breaks connect.
  ok(
    !buyer.includes('https://api.ebay.com/oauth/api_scope/buy.order.readonly'),
    'buy.order.readonly must not be in the default (opt-in via EBAY_BUYER_SCOPES once approved)',
  );
  // buyer set must NOT carry seller scopes
  ok(!buyer.some((s) => s.includes('/sell.')), 'buyer scopes must not include seller scopes');

  // Approved orgs opt in explicitly via the env override.
  process.env.EBAY_BUYER_SCOPES =
    'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.order.readonly';
  deepStrictEqual(ebayBuyerScopes(), [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/buy.order.readonly',
  ]);
});

test('normalizeEbayRole maps only "buyer" to buyer, everything else to seller', () => {
  strictEqual(normalizeEbayRole('buyer'), 'buyer');
  strictEqual(normalizeEbayRole('BUYER'), 'buyer');
  strictEqual(normalizeEbayRole(' Buyer '), 'buyer');
  strictEqual(normalizeEbayRole('seller'), 'seller');
  strictEqual(normalizeEbayRole(undefined), 'seller');
  strictEqual(normalizeEbayRole('garbage'), 'seller');
});

test('ebayScopeStringForRole picks the role-matched set (no cross-contamination)', () => {
  process.env.EBAY_SCOPES = 'https://api.ebay.com/oauth/api_scope/sell.inventory';
  process.env.EBAY_BUYER_SCOPES = 'https://api.ebay.com/oauth/api_scope/buy.order.readonly';
  strictEqual(ebayScopeStringForRole('seller'), 'https://api.ebay.com/oauth/api_scope/sell.inventory');
  strictEqual(ebayScopeStringForRole('buyer'), 'https://api.ebay.com/oauth/api_scope/buy.order.readonly');
});

test('normalizeEbayEnvironment defaults to PRODUCTION and is case-insensitive', () => {
  strictEqual(normalizeEbayEnvironment(undefined), 'PRODUCTION');
  strictEqual(normalizeEbayEnvironment(''), 'PRODUCTION');
  strictEqual(normalizeEbayEnvironment('PRODUCTION'), 'PRODUCTION');
  strictEqual(normalizeEbayEnvironment('garbage'), 'PRODUCTION');
  strictEqual(normalizeEbayEnvironment('SANDBOX'), 'SANDBOX');
  strictEqual(normalizeEbayEnvironment('sandbox'), 'SANDBOX');
  strictEqual(normalizeEbayEnvironment(' Sandbox '), 'SANDBOX');
});

test('endpoints are environment-aware', () => {
  strictEqual(isEbaySandbox('SANDBOX'), true);
  strictEqual(isEbaySandbox('PRODUCTION'), false);

  strictEqual(ebayAuthDomain('SANDBOX'), 'auth.sandbox.ebay.com');
  strictEqual(ebayAuthDomain('PRODUCTION'), 'auth.ebay.com');

  strictEqual(ebayTokenEndpoint('SANDBOX'), 'https://api.sandbox.ebay.com/identity/v1/oauth2/token');
  strictEqual(ebayTokenEndpoint('PRODUCTION'), 'https://api.ebay.com/identity/v1/oauth2/token');

  strictEqual(ebayIdentityEndpoint('SANDBOX'), 'https://api.sandbox.ebay.com/commerce/identity/v1/user/');
  strictEqual(ebayIdentityEndpoint('PRODUCTION'), 'https://api.ebay.com/commerce/identity/v1/user/');
});

test('probeEbayOauthAuthorizeConfig detects errorOauth invalid_request', async () => {
  const hops = [
    'https://auth2.ebay.com/oauth2/authorize?client_id=x',
    'https://auth2.ebay.com/oauth2/errorOauth?errorId=invalid_request',
  ];
  let i = 0;
  const fetchImpl: typeof fetch = async () => {
    const location = hops[i++];
    return new Response(null, {
      status: 302,
      headers: location ? { location } : undefined,
    });
  };
  const result = await probeEbayOauthAuthorizeConfig({
    appId: 'Densense-CycleFor-PRD-test',
    ruName: 'Some_RuName',
    environment: 'PRODUCTION',
    scope: 'https://api.ebay.com/oauth/api_scope',
    fetchImpl,
  });
  deepStrictEqual(result, {
    ok: false,
    errorId: 'invalid_request',
    reason: 'invalid_request',
  });
});

test('probeEbayOauthAuthorizeConfig treats terminal HTML as ok', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('<html>sign in</html>', { status: 200 });
  const result = await probeEbayOauthAuthorizeConfig({
    appId: 'Densense-CycleFor-PRD-test',
    ruName: 'Some_RuName',
    environment: 'PRODUCTION',
    scope: 'https://api.ebay.com/oauth/api_scope',
    fetchImpl,
  });
  deepStrictEqual(result, { ok: true });
});
