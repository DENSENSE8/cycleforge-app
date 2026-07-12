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
  const s = newOAuthState('google', { slug: 'acme', next: '/dashboard', verifier: 'v'.repeat(43) });
  const decoded = decodeOAuthState(encodeOAuthState(s));
  ok(decoded);
  deepStrictEqual(decoded, s);
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
