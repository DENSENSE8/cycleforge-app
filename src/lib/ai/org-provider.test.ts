/**
 * DB-free unit tests for the per-org AI provider chain.
 *
 * The load-bearing case is Cloudflare Access: `hermes-client.getHermesHeaders()`
 * was the ONLY thing in src/ that emitted `CF-Access-Client-Id/Secret`, so
 * retiring it without this coverage drops edge auth on every tunnelled
 * self-hosted endpoint — a Cloudflare 403 that reads like a model failure.
 * See docs/todo/ai-provider-consolidation-HANDOFF.md, Phase 0.
 *
 * Run: node --import tsx --test src/lib/ai/org-provider.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOrgAiChain,
  resolveOrgAiConfig,
  resolveOrgAnthropicBrain,
  type OrgAiDeps,
} from './org-provider';
import type { AiProviderOrder } from './provider-order';
import type { AiCapability, AiProviderConfig } from './provider';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-under-test' as OrgId;

/** Vault fake: only the named providers answer; everything else is unconnected. */
function fakes(
  vault: Partial<Record<IntegrationProvider, unknown>> = {},
  platform?: AiProviderConfig,
  opts: {
    order?: AiProviderOrder;
    demoted?: IntegrationProvider[];
    platformAnthropicKey?: string;
  } = {},
) {
  const asked: IntegrationProvider[] = [];
  const deps: OrgAiDeps = {
    getIntegrationCredentials: async <T,>(_orgId: OrgId, provider: IntegrationProvider) => {
      asked.push(provider);
      return (vault[provider] ?? null) as T | null;
    },
    isAiConfigured: () => platform !== undefined,
    resolveAiConfig: (_capability: AiCapability) => {
      if (!platform) throw new Error('platform default unconfigured');
      return platform;
    },
    resolveOrder: async () => opts.order ?? 'local-first',
    isDemoted: (_orgId, source) => (opts.demoted ?? []).includes(source as IntegrationProvider),
    resolvePlatformAnthropicKey: () => opts.platformAnthropicKey ?? '',
  };
  return { deps, asked };
}

test('ollama: Cloudflare Access service token is emitted as request headers', async () => {
  const { deps } = fakes({
    ollama: {
      baseUrl: 'http://prometheus:8080/v1',
      tunnelUrl: 'https://ai.example.com/v1/',
      model: 'qwen/qwen3.8-27b',
      cfAccessClientId: 'cf-id',
      cfAccessClientSecret: 'cf-secret',
    },
  });

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.ok(cfg);
  assert.equal(cfg.source, 'ollama');
  // tunnelUrl wins over baseUrl (server-reachable), trailing slash stripped.
  assert.equal(cfg.baseURL, 'https://ai.example.com/v1');
  assert.deepEqual(cfg.headers, {
    'CF-Access-Client-Id': 'cf-id',
    'CF-Access-Client-Secret': 'cf-secret',
  });
});

test('ollama: headers are OMITTED, not empty, when CF Access is unconfigured', async () => {
  const { deps } = fakes({
    ollama: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3' },
  });

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.ok(cfg);
  // `undefined` (not {}) so a caller can spread it unconditionally.
  assert.equal(cfg.headers, undefined);
  assert.equal(cfg.apiKey, '');
});

test('ollama: a half-configured CF pair sends the half that exists', async () => {
  const { deps } = fakes({
    ollama: { baseUrl: 'https://ai.example.com/v1', model: 'm', cfAccessClientId: 'only-id' },
  });

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.deepEqual(cfg?.headers, { 'CF-Access-Client-Id': 'only-id' });
});

test('a cloud provider carries no CF headers (they belong to the tunnelled endpoint)', async () => {
  const { deps } = fakes({ openai: { apiKey: 'sk-test' } });

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'openai');
  assert.equal(cfg?.headers, undefined);
});

test('the platform default passes its own headers through verbatim', async () => {
  const { deps } = fakes(
    {},
    {
      baseURL: 'http://127.0.0.1:8642/v1',
      apiKey: 'local',
      model: 'hermes-agent',
      headers: { 'CF-Access-Client-Id': 'platform-id' },
    },
  );

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'platform');
  assert.deepEqual(cfg?.headers, { 'CF-Access-Client-Id': 'platform-id' });
});

test('the default order is LOCAL-FIRST — ollama is consulted before any cloud', async () => {
  // The inversion. Was hardcoded ai_gateway → openai → anthropic → ollama, so
  // a tenant with their own box still paid a cloud vendor by default.
  const { deps, asked } = fakes({ ollama: { baseUrl: 'http://x/v1', model: 'm' } });

  await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.deepEqual(asked, ['ollama', 'grok', 'ai_gateway', 'openai', 'anthropic']);
});

test('cloud-first is honoured when the org asks for it', async () => {
  const { deps, asked } = fakes(
    { ollama: { baseUrl: 'http://x/v1', model: 'm' }, openai: { apiKey: 'sk' } },
    undefined,
    { order: 'cloud-first' },
  );

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'openai');
  assert.deepEqual(asked, ['grok', 'ai_gateway', 'openai', 'anthropic', 'ollama']);
});

test('the chain returns EVERY usable provider, preferred first', async () => {
  const { deps } = fakes(
    { ollama: { baseUrl: 'http://local/v1', model: 'm' }, openai: { apiKey: 'sk' } },
    { baseURL: 'https://gw/v1', apiKey: 'k', model: 'gw-m' },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.deepEqual(chain.map((c) => c.source), ['ollama', 'openai', 'platform']);
});

test('the platform default is ALWAYS last — a tenant provider never loses to it', async () => {
  const { deps } = fakes(
    { openai: { apiKey: 'sk' } },
    { baseURL: 'https://gw/v1', apiKey: 'k', model: 'gw-m' },
    { order: 'cloud-first' },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.equal(chain.at(-1)?.source, 'platform');
});

test('a demoted provider SINKS to the back — it is never dropped', async () => {
  // Dropping it would turn a transient timeout into "AI is not configured".
  const { deps } = fakes(
    { ollama: { baseUrl: 'http://local/v1', model: 'm' }, openai: { apiKey: 'sk' } },
    undefined,
    { demoted: ['ollama'] },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.deepEqual(chain.map((c) => c.source), ['openai', 'ollama']);
  // Still reachable as a last resort, so a wrongly-demoted box can still serve.
  assert.equal(chain.length, 2);
});

test('every provider demoted still yields a chain, not an empty one', async () => {
  const { deps } = fakes(
    { ollama: { baseUrl: 'http://local/v1', model: 'm' } },
    undefined,
    { demoted: ['ollama'] },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.equal(chain.length, 1);
  assert.equal(chain[0]!.source, 'ollama');
});

test('embed skips anthropic (no embeddings API) and can resolve ollama', async () => {
  const { deps, asked } = fakes({
    ollama: { baseUrl: 'http://x/v1', model: 'chat-m', embedModel: 'nomic-embed-text' },
  });

  const cfg = await resolveOrgAiConfig(ORG, 'embed', deps);

  assert.equal(cfg?.model, 'nomic-embed-text');
  assert.ok(!asked.includes('anthropic'));
  assert.ok(!asked.includes('grok'));
});

test('grok SuperGrok session is an OpenAI-wire chat candidate on the subscription proxy', async () => {
  const { deps } = fakes({
    grok: {
      accessToken: 'sess',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
      chatModel: 'grok-4.6',
    },
  });

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'grok');
  assert.equal(cfg?.baseURL, 'https://cli-chat-proxy.grok.com/v1');
  assert.equal(cfg?.apiKey, 'sess');
  assert.equal(cfg?.headers?.['X-XAI-Token-Auth'], 'xai-grok-cli');
  assert.equal(cfg?.headers?.['x-grok-model-override'], 'grok-4.6');
  assert.ok(cfg?.headers?.['x-grok-client-version']);
  assert.notEqual(cfg?.headers?.['x-grok-client-version'], 'none');
});

test('grok is skipped for embed even when connected', async () => {
  const { deps, asked } = fakes({
    grok: { accessToken: 'sess', refreshToken: 'rt', expiresAt: Date.now() + 60_000 },
    openai: { apiKey: 'sk', embedModel: 'text-embedding-3-small' },
  });

  const cfg = await resolveOrgAiConfig(ORG, 'embed', deps);

  assert.equal(cfg?.source, 'openai');
  assert.ok(!asked.includes('grok'));
});

test('nothing connected and no platform default resolves to null, never a throw', async () => {
  const { deps } = fakes({});
  assert.equal(await resolveOrgAiConfig(ORG, 'chat', deps), null);
});

test('a vault failure degrades to the platform default instead of throwing', async () => {
  const deps: OrgAiDeps = {
    getIntegrationCredentials: async () => {
      throw new Error('vault unreachable');
    },
    isAiConfigured: () => true,
    resolveAiConfig: () => ({ baseURL: 'https://gw/v1', apiKey: 'k', model: 'm' }),
    resolveOrder: async () => 'local-first',
    isDemoted: () => false,
  };

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'platform');
});

test('a throwing health cache degrades to the unsorted chain, never an error', async () => {
  // The cache is best-effort (same posture as redisAdvanceLock): correctness
  // comes from the failover loop, so an unreadable cache costs one timeout.
  const deps: OrgAiDeps = {
    getIntegrationCredentials: async <T,>() => null as T | null,
    isAiConfigured: () => true,
    resolveAiConfig: () => ({ baseURL: 'https://gw/v1', apiKey: 'k', model: 'm' }),
    resolveOrder: async () => 'local-first',
    isDemoted: () => {
      throw new Error('health cache exploded');
    },
  };

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'platform');
});

test('an unreadable ORDER preference still yields the platform default', async () => {
  const deps: OrgAiDeps = {
    getIntegrationCredentials: async <T,>() => null as T | null,
    isAiConfigured: () => true,
    resolveAiConfig: () => ({ baseURL: 'https://gw/v1', apiKey: 'k', model: 'm' }),
    resolveOrder: async () => {
      throw new Error('settings unreadable');
    },
    isDemoted: () => false,
  };

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'platform');
});

// ─── The assistant's Anthropic-native brain (agent loop) ─────────────────────
// Deliberately NOT the OpenAI-wire chain: the agent loop speaks Anthropic's
// native tool-use protocol, which an Ollama or Gateway endpoint does not
// implement.

test("the org's OWN Anthropic key wins over the platform key", async () => {
  // Before this resolver existed the loop read process.env directly, so every
  // tenant's assistant ran on one platform key and one hardcoded model.
  const { deps } = fakes({ anthropic: { apiKey: 'sk-org', chatModel: 'claude-org-model' } }, undefined, {
    platformAnthropicKey: 'sk-platform',
  });

  const brain = await resolveOrgAnthropicBrain(ORG, deps);

  assert.equal(brain?.apiKey, 'sk-org');
  assert.equal(brain?.source, 'anthropic');
  // The model follows the key — billing someone's own key for a model they did
  // not choose is the kind of surprise that shows up on an invoice.
  assert.equal(brain?.model, 'claude-org-model');
});

test('the platform key is the fallback, and names no model', async () => {
  const { deps } = fakes({}, undefined, { platformAnthropicKey: 'sk-platform' });

  const brain = await resolveOrgAnthropicBrain(ORG, deps);

  assert.equal(brain?.source, 'platform');
  assert.equal(brain?.model, null, 'caller applies its own default');
});

test('no Anthropic anywhere resolves to null, so the caller can degrade', async () => {
  const { deps } = fakes({});
  assert.equal(await resolveOrgAnthropicBrain(ORG, deps), null);
});

test('an org key without a model falls back to the caller default, not the platform key', async () => {
  const { deps } = fakes({ anthropic: { apiKey: 'sk-org' } }, undefined, {
    platformAnthropicKey: 'sk-platform',
  });

  const brain = await resolveOrgAnthropicBrain(ORG, deps);

  assert.equal(brain?.apiKey, 'sk-org');
  assert.equal(brain?.model, null);
});

test('a vault failure degrades to the platform key rather than throwing', async () => {
  const deps: OrgAiDeps = {
    getIntegrationCredentials: async () => {
      throw new Error('vault unreachable');
    },
    isAiConfigured: () => false,
    resolveAiConfig: () => {
      throw new Error('unused');
    },
    resolveOrder: async () => 'local-first',
    isDemoted: () => false,
    resolvePlatformAnthropicKey: () => 'sk-platform',
  };

  const brain = await resolveOrgAnthropicBrain(ORG, deps);

  assert.equal(brain?.source, 'platform');
});
