/**
 * DB-free tests for SuperGrok host-session parsing + proxy headers.
 * Run: npx tsx --test src/lib/integrations/grok/oauth.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROK_DEFAULT_CHAT_MODEL,
  GROK_OIDC_CLIENT_ID,
  GROK_OIDC_ISSUER,
  grokAccessIsLive,
  grokAccessTokenExpiryMs,
  grokChatConfig,
  grokProxyHeaders,
  isGrokTokenFresh,
  parseHostGrokSession,
} from './oauth';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');

test('parseHostGrokSession prefers auth.x.ai::<client-id> over the legacy key', () => {
  const parsed = parseHostGrokSession(
    {
      'https://accounts.x.ai/sign-in': {
        key: 'legacy-access',
        refresh_token: 'legacy-refresh',
        expires_at: '2026-09-04T18:00:00.000Z',
        email: 'old@example.com',
      },
      [`${GROK_OIDC_ISSUER}::${GROK_OIDC_CLIENT_ID}`]: {
        key: 'oidc-access',
        refresh_token: 'oidc-refresh',
        expires_at: '2026-09-04T18:00:00.000Z',
        email: 'pajamas@example.com',
        first_name: 'FireBall',
        oidc_issuer: GROK_OIDC_ISSUER,
        oidc_client_id: GROK_OIDC_CLIENT_ID,
      },
    },
    NOW,
  );

  assert.ok(parsed);
  assert.equal(parsed.accessToken, 'oidc-access');
  assert.equal(parsed.refreshToken, 'oidc-refresh');
  assert.equal(parsed.accountEmail, 'pajamas@example.com');
  assert.equal(parsed.accountName, 'FireBall');
  assert.equal(parsed.expiresAt, Date.parse('2026-09-04T18:00:00.000Z'));
});

test('parseHostGrokSession falls back to the legacy accounts.x.ai key', () => {
  const parsed = parseHostGrokSession(
    {
      'https://accounts.x.ai/sign-in': {
        key: 'legacy-access',
        refresh_token: 'legacy-refresh',
        expires_at: '2026-09-04T18:00:00.000Z',
      },
    },
    NOW,
  );
  assert.equal(parsed?.accessToken, 'legacy-access');
});

test('parseHostGrokSession ignores entries missing a refresh token', () => {
  assert.equal(
    parseHostGrokSession({ [`${GROK_OIDC_ISSUER}::${GROK_OIDC_CLIENT_ID}`]: { key: 'only-access' } }, NOW),
    null,
  );
});

test('isGrokTokenFresh uses a 5-minute skew so in-flight calls do not 401', () => {
  assert.equal(isGrokTokenFresh(NOW + 10 * 60 * 1000, NOW), true);
  assert.equal(isGrokTokenFresh(NOW + 60 * 1000, NOW), false);
  assert.equal(isGrokTokenFresh(undefined, NOW), false);
});

test('grokAccessIsLive prefers a live JWT even when expiresAt is missing', () => {
  const exp = Math.floor((NOW + 60 * 60 * 1000) / 1000);
  const payload = Buffer.from(JSON.stringify({ exp }), 'utf8').toString('base64url');
  const token = `eyJhbGciOiJub25lIn0.${payload}.sig`;
  assert.equal(grokAccessTokenExpiryMs(token), exp * 1000);
  assert.equal(grokAccessIsLive({ accessToken: token }, NOW), true);
  assert.equal(grokAccessIsLive({ accessToken: token, expiresAt: NOW }, NOW), true);
});

test('grok proxy headers mark the bearer as a CLI subscription session', () => {
  const h = grokProxyHeaders('grok-4.6');
  assert.equal(h['X-XAI-Token-Auth'], 'xai-grok-cli');
  assert.equal(h['x-grok-model-override'], 'grok-4.6');
  assert.equal(h['x-grok-client-identifier'], 'grok-shell');
  assert.ok(h['x-grok-client-version']);
  assert.notEqual(h['x-grok-client-version'], 'none');
  assert.match(h['User-Agent'] ?? '', /^xai-grok-cli\//);
});

test('grokChatConfig points at the subscription proxy, not api.x.ai', () => {
  const cfg = grokChatConfig({ accessToken: 'sess', chatModel: GROK_DEFAULT_CHAT_MODEL });
  assert.equal(cfg.source, 'grok');
  assert.equal(cfg.baseURL, 'https://cli-chat-proxy.grok.com/v1');
  assert.equal(cfg.apiKey, 'sess');
  assert.equal(cfg.headers?.['X-XAI-Token-Auth'], 'xai-grok-cli');
  assert.ok(!cfg.baseURL.includes('api.x.ai'));
});
