/**
 * Platform OAuth helpers — DB-free.
 *
 * State round-trips, tampered/missing state is rejected, and provider config is
 * gated on env presence (buttons must not appear when unconfigured).
 */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  newOAuthState,
  encodeOAuthState,
  decodeOAuthState,
  isPlatformProviderConfigured,
  configuredPlatformProviders,
  resolveRedirectUri,
  platformProviderConfig,
} from '@/lib/auth/platform-oauth';

test('state encode → decode round-trips', () => {
  const s = newOAuthState('google', {
    slug: 'acme',
    next: '/dashboard',
    verifier: 'v'.repeat(43),
    signinPath: '/m/signin',
  });
  const decoded = decodeOAuthState(encodeOAuthState(s));
  ok(decoded);
  deepStrictEqual(decoded, s);
  strictEqual(decoded.signinPath, '/m/signin');
});

test('decode rejects garbage / missing fields', () => {
  strictEqual(decodeOAuthState(null), null);
  strictEqual(decodeOAuthState('not-base64url-json'), null);
  strictEqual(decodeOAuthState(Buffer.from('{}').toString('base64url')), null);
  strictEqual(
    decodeOAuthState(Buffer.from(JSON.stringify({ provider: 'evil', state: 'x', nonce: 'y', verifier: 'z' })).toString('base64url')),
    null,
  );
});

test('provider config is gated on env presence', () => {
  const prevId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const prevSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  try {
    strictEqual(isPlatformProviderConfigured('google'), false, 'unset env → not configured');
    ok(!configuredPlatformProviders().includes('google'), 'not advertised when unset');

    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
    strictEqual(isPlatformProviderConfigured('google'), true, 'set env → configured');
    const cfg = platformProviderConfig('google');
    ok(cfg);
    strictEqual(cfg.scope, 'openid email profile', 'never requests Drive/Gmail scopes');
    strictEqual(
      resolveRedirectUri(cfg, 'https://x.app.cycleforge.ai'),
      'https://x.app.cycleforge.ai/api/auth/oauth/google/callback',
      'derives redirect uri from origin when unset',
    );
  } finally {
    if (prevId !== undefined) process.env.GOOGLE_OAUTH_CLIENT_ID = prevId; else delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (prevSecret !== undefined) process.env.GOOGLE_OAUTH_CLIENT_SECRET = prevSecret; else delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  }
});

test('apple provider config gates on credentials presence and derives endpoints', () => {
  const prevId = process.env.APPLE_OAUTH_CLIENT_ID;
  const prevTeam = process.env.APPLE_OAUTH_TEAM_ID;
  const prevKey = process.env.APPLE_OAUTH_KEY_ID;
  const prevPriv = process.env.APPLE_OAUTH_PRIVATE_KEY;

  delete process.env.APPLE_OAUTH_CLIENT_ID;
  delete process.env.APPLE_OAUTH_TEAM_ID;
  delete process.env.APPLE_OAUTH_KEY_ID;
  delete process.env.APPLE_OAUTH_PRIVATE_KEY;

  try {
    strictEqual(isPlatformProviderConfigured('apple'), false, 'unset env → not configured');
    ok(!configuredPlatformProviders().includes('apple'), 'not advertised when unset');

    process.env.APPLE_OAUTH_CLIENT_ID = 'test-apple-client';
    process.env.APPLE_OAUTH_TEAM_ID = 'test-team';
    process.env.APPLE_OAUTH_KEY_ID = 'test-key';
    process.env.APPLE_OAUTH_PRIVATE_KEY = 'test-priv';

    strictEqual(isPlatformProviderConfigured('apple'), true, 'all keys present → configured');
    ok(configuredPlatformProviders().includes('apple'), 'advertised when configured');
  } finally {
    if (prevId !== undefined) process.env.APPLE_OAUTH_CLIENT_ID = prevId; else delete process.env.APPLE_OAUTH_CLIENT_ID;
    if (prevTeam !== undefined) process.env.APPLE_OAUTH_TEAM_ID = prevTeam; else delete process.env.APPLE_OAUTH_TEAM_ID;
    if (prevKey !== undefined) process.env.APPLE_OAUTH_KEY_ID = prevKey; else delete process.env.APPLE_OAUTH_KEY_ID;
    if (prevPriv !== undefined) process.env.APPLE_OAUTH_PRIVATE_KEY = prevPriv; else delete process.env.APPLE_OAUTH_PRIVATE_KEY;
  }
});
