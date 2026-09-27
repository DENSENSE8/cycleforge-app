/**
 * DB-free unit tests for the AI provider config layer.
 * Run: node --import tsx --test src/lib/ai/provider.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiRequestHeaders,
  EMBEDDING_DIMS,
  isAiConfigured,
  isSelfHostedAiRuntime,
  resolveAiConfig,
  resolveCloudflareAccessHeaders,
  type ProviderEnv,
} from './provider';

test('chat: AI_CHAT_* env wins and is returned verbatim (gateway prod shape)', () => {
  const env: ProviderEnv = {
    AI_CHAT_BASE_URL: 'https://ai-gateway.vercel.sh/v1/',
    AI_CHAT_MODEL: 'anthropic/claude-haiku-4-5',
    AI_CHAT_API_KEY: 'vck_test',
    // Legacy vars present but must NOT win over the explicit set.
    HERMES_API_URL: 'http://127.0.0.1:8642/v1',
    HERMES_API_KEY: 'local',
    AI_MODEL: 'gemma-4-e4b',
  };
  const cfg = resolveAiConfig('chat', env);
  assert.equal(cfg.baseURL, 'https://ai-gateway.vercel.sh/v1'); // trailing slash stripped
  assert.equal(cfg.model, 'anthropic/claude-haiku-4-5');
  assert.equal(cfg.apiKey, 'vck_test');
});

test('chat: the legacy Hermes env fallback is GONE (one var set, not two)', () => {
  // Retired with hermes-client.ts. Two env sets for one capability is how the
  // modern vars came to look configured while the legacy path ignored them.
  const env: ProviderEnv = {
    HERMES_API_URL: 'http://127.0.0.1:8642/v1',
    HERMES_API_KEY: 'local-key',
    AI_MODEL: 'gemma-4-e4b',
  };
  assert.throws(() => resolveAiConfig('chat', env));
  assert.equal(isAiConfigured('chat', env), false);
});

test('chat: defaults model to the gateway Haiku string when nothing names one', () => {
  const cfg = resolveAiConfig('chat', { AI_CHAT_BASE_URL: 'https://gw.example/v1' });
  assert.equal(cfg.model, 'anthropic/claude-haiku-4-5');
  assert.equal(cfg.apiKey, '');
});

test('chat: unconfigured throws a loud error naming the missing env vars', () => {
  assert.throws(
    () => resolveAiConfig('chat', {}),
    (err: Error) =>
      err.message.includes('AI_CHAT_BASE_URL') && err.message.includes('AI_CHAT_MODEL'),
  );
});

test('embed: resolves AI_EMBED_* set with prod default model', () => {
  const cfg = resolveAiConfig('embed', {
    AI_EMBED_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
    AI_EMBED_API_KEY: 'vck_embed',
  });
  assert.equal(cfg.baseURL, 'https://ai-gateway.vercel.sh/v1');
  assert.equal(cfg.model, 'openai/text-embedding-3-small');
  assert.equal(cfg.apiKey, 'vck_embed');
});

test('embed: dev override (Ollama nomic-embed-text) is honored', () => {
  const cfg = resolveAiConfig('embed', {
    AI_EMBED_BASE_URL: 'http://127.0.0.1:11434/v1/',
    AI_EMBED_MODEL: 'nomic-embed-text',
  });
  assert.equal(cfg.baseURL, 'http://127.0.0.1:11434/v1');
  assert.equal(cfg.model, 'nomic-embed-text');
  assert.equal(cfg.apiKey, '');
});

test('embed: has NO legacy fallback — Hermes vars alone still throw, naming AI_EMBED_BASE_URL', () => {
  assert.throws(
    () => resolveAiConfig('embed', { HERMES_API_URL: 'http://127.0.0.1:8642/v1' }),
    (err: Error) => err.message.includes('AI_EMBED_BASE_URL'),
  );
});

test('isAiConfigured mirrors resolution without throwing', () => {
  assert.equal(isAiConfigured('chat', {}), false);
  assert.equal(isAiConfigured('chat', { HERMES_API_URL: 'http://x/v1' }), false); // legacy var is inert
  assert.equal(isAiConfigured('chat', { AI_CHAT_BASE_URL: 'http://y/v1' }), true);
  assert.equal(isAiConfigured('embed', { HERMES_API_URL: 'http://x/v1' }), false);
  assert.equal(isAiConfigured('embed', { AI_EMBED_BASE_URL: 'http://z/v1' }), true);
});

test('blank/whitespace env values are treated as unset', () => {
  assert.equal(isAiConfigured('embed', { AI_EMBED_BASE_URL: '   ' }), false);
  assert.throws(() => resolveAiConfig('embed', { AI_EMBED_BASE_URL: '' }));
});

test('EMBEDDING_DIMS is pinned at 768 (schema + provider interchange contract)', () => {
  assert.equal(EMBEDDING_DIMS, 768);
});

// --- Cloudflare Access passthrough (Phase 0 of the AI provider consolidation).

test('chat: CF Access headers ride the config when both vars are set', () => {
  const cfg = resolveAiConfig('chat', {
    AI_CHAT_BASE_URL: 'http://127.0.0.1:8642/v1',
    CLOUDFLARE_ACCESS_CLIENT_ID: 'cf-id',
    CLOUDFLARE_ACCESS_CLIENT_SECRET: 'cf-secret',
  });
  assert.deepEqual(cfg.headers, {
    'CF-Access-Client-Id': 'cf-id',
    'CF-Access-Client-Secret': 'cf-secret',
  });
});

test('chat: headers are omitted entirely when CF Access is unconfigured', () => {
  const cfg = resolveAiConfig('chat', { AI_CHAT_BASE_URL: 'http://127.0.0.1:8642/v1' });
  assert.equal(cfg.headers, undefined);
  assert.ok(!('headers' in cfg));
});

test('chat: CF_AIG_TOKEN rides as cf-aig-authorization, never as the provider bearer', () => {
  const cfg = resolveAiConfig('chat', {
    AI_CHAT_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/acct/default/compat',
    AI_CHAT_API_KEY: '',
    CF_AIG_TOKEN: 'aig-token',
    CLOUDFLARE_ACCESS_CLIENT_ID: 'cf-id',
  });
  const h = aiRequestHeaders(cfg);
  assert.equal(h['cf-aig-authorization'], 'Bearer aig-token');
  assert.equal(h['CF-Access-Client-Id'], 'cf-id');
  assert.equal(h.Authorization, undefined);
  assert.equal(isSelfHostedAiRuntime(cfg), false);
});

test('resolveCloudflareAccessHeaders: undefined when neither var is set', () => {
  assert.equal(resolveCloudflareAccessHeaders({}), undefined);
  assert.equal(resolveCloudflareAccessHeaders({ CLOUDFLARE_ACCESS_CLIENT_ID: '  ' }), undefined);
});

test('resolveCloudflareAccessHeaders: emits whichever half is configured', () => {
  assert.deepEqual(resolveCloudflareAccessHeaders({ CLOUDFLARE_ACCESS_CLIENT_SECRET: 's' }), {
    'CF-Access-Client-Secret': 's',
  });
});

test('aiRequestHeaders: bearer + endpoint headers are BOTH sent', () => {
  const h = aiRequestHeaders({
    apiKey: 'model-key',
    headers: { 'CF-Access-Client-Id': 'cf-id' },
  });
  assert.equal(h.Authorization, 'Bearer model-key');
  assert.equal(h['CF-Access-Client-Id'], 'cf-id');
  assert.equal(h['Content-Type'], 'application/json');
});

test('aiRequestHeaders: no bearer when the endpoint needs no key', () => {
  const h = aiRequestHeaders({ apiKey: '' });
  assert.ok(!('Authorization' in h));
});

test('aiRequestHeaders: per-call extras win over the defaults', () => {
  const h = aiRequestHeaders(
    { apiKey: 'k', headers: { 'X-Both': 'endpoint' } },
    { 'X-Both': 'call', 'X-Hermes-Session-Id': 's1' },
  );
  assert.equal(h['X-Both'], 'call');
  assert.equal(h['X-Hermes-Session-Id'], 's1');
});
