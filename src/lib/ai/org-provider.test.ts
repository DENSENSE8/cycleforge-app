/** DB-free unit tests for the per-org AI provider chain. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOrgAiChain,
  resolveOrgAiConfig,
  resolveOrgAnthropicBrain,
  type AiProviderSource,
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
    demoted?: AiProviderSource[];
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
    isDemoted: (_orgId, source) => (opts.demoted ?? []).includes(source),
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

  assert.deepEqual(asked, ['ollama', 'ai_gateway', 'openai', 'anthropic']);
});

test('cloud-first is honoured when the org asks for it', async () => {
  const { deps, asked } = fakes(
    { ollama: { baseUrl: 'http://x/v1', model: 'm' }, openai: { apiKey: 'sk' } },
    undefined,
    { order: 'cloud-first' },
  );

  const cfg = await resolveOrgAiConfig(ORG, 'chat', deps);

  assert.equal(cfg?.source, 'openai');
  assert.deepEqual(asked, ['ai_gateway', 'openai', 'anthropic', 'ollama']);
});

test('the chain returns EVERY usable provider, preferred first', async () => {
  const { deps } = fakes(
    { ollama: { baseUrl: 'http://local/v1', model: 'm' }, openai: { apiKey: 'sk' } },
    { baseURL: 'https://gw/v1', apiKey: 'k', model: 'gw-m' },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.deepEqual(chain.map((c) => c.source), ['ollama', 'openai', 'platform']);
});

test('by default the platform is LAST — a tenant provider never loses to it', async () => {
  const { deps } = fakes(
    { openai: { apiKey: 'sk' } },
    { baseURL: 'https://gw/v1', apiKey: 'k', model: 'gw-m' },
    { order: 'cloud-first' },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.equal(chain.at(-1)?.source, 'platform');
});

test('platformFirst puts the platform default at the HEAD, tenant providers behind it as failover', async () => {
  const { deps } = fakes(
    { ollama: { baseUrl: 'http://local/v1', model: 'm' }, openai: { apiKey: 'sk' } },
    { baseURL: 'https://gw/v1', apiKey: '', model: 'gw-m' },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps, { platformFirst: true });
  const head = await resolveOrgAiConfig(ORG, 'chat', deps, { platformFirst: true });

  assert.deepEqual(chain.map((c) => c.source), ['platform', 'ollama', 'openai']);
  assert.equal(head?.baseURL, 'https://gw/v1');
});

test('platformFirst without a platform default leaves the tenant chain as-is', async () => {
  const { deps } = fakes({ ollama: { baseUrl: 'http://local/v1', model: 'm' } });

  const chain = await resolveOrgAiChain(ORG, 'chat', deps, { platformFirst: true });

  assert.deepEqual(chain.map((c) => c.source), ['ollama']);
});

test('platformFirst does not shield a DEMOTED platform — it sinks like any provider', async () => {
  const { deps } = fakes(
    { ollama: { baseUrl: 'http://local/v1', model: 'm' } },
    { baseURL: 'https://gw/v1', apiKey: '', model: 'gw-m' },
    { demoted: ['platform'] },
  );

  const chain = await resolveOrgAiChain(ORG, 'chat', deps, { platformFirst: true });

  assert.deepEqual(chain.map((c) => c.source), ['ollama', 'platform']);
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

test('an ASYNC (shared-store) demotion answer sinks the provider the same way', async () => {
  // The default dep reads Redis, so the answer is a promise; it must not be
  // treated as truthy-by-being-a-promise (that would sink every provider).
  const { deps } = fakes({ ollama: { baseUrl: 'http://local/v1', model: 'm' }, openai: { apiKey: 'sk' } });
  deps.isDemoted = async (_orgId, source) => source === 'ollama';

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.deepEqual(chain.map((c) => c.source), ['openai', 'ollama']);
});

test('a REJECTED async demotion check degrades to the unsorted chain', async () => {
  const { deps } = fakes({ ollama: { baseUrl: 'http://local/v1', model: 'm' }, openai: { apiKey: 'sk' } });
  deps.isDemoted = async () => {
    throw new Error('redis brownout');
  };

  const chain = await resolveOrgAiChain(ORG, 'chat', deps);

  assert.deepEqual(chain.map((c) => c.source), ['ollama', 'openai']);
});

test('embed skips anthropic (no embeddings API) and can resolve ollama', async () => {
  const { deps, asked } = fakes({
    ollama: { baseUrl: 'http://x/v1', model: 'chat-m', embedModel: 'nomic-embed-text' },
  });

  const cfg = await resolveOrgAiConfig(ORG, 'embed', deps);

  assert.equal(cfg?.model, 'nomic-embed-text');
  assert.ok(!asked.includes('anthropic'));
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

// ─── The assistant's Anthropic-native brain (agent loop) ───────────────────── Deliberately NOT the OpenAI-wire chain:

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

test('local agent: `first` heads the assistant chain; `fallback` sits right behind the platform leaf', async () => {
  const platform = { baseURL: 'https://gateway.ai.cloudflare.com/v1/x/compat', apiKey: '', model: 'workers-ai/llama' };
  const local = { baseURL: 'http://127.0.0.1:18088/v1', apiKey: '', model: 'default_model' };
  const vault = { ollama: { baseUrl: 'http://127.0.0.1:18002/v1', model: 'cf-v2-base' } };
  const sources = async (position: 'first' | 'fallback', demoted: AiProviderSource[] = []) => {
    const { deps } = fakes(vault, platform, { demoted });
    deps.resolveLocalAgent = () => ({ config: local, position });
    const chain = await resolveOrgAiChain(ORG, 'chat', deps, { platformFirst: true, localAgent: true });
    return chain.map((c) => c.source);
  };
  assert.deepEqual(await sources('first'), ['local_mlx', 'platform', 'ollama']);
  assert.deepEqual(await sources('fallback'), ['platform', 'local_mlx', 'ollama']);
  // A demoted gateway (quota 429 a moment ago) sinks: the local agent answers the next turn first.
  assert.deepEqual(await sources('fallback', ['platform']), ['local_mlx', 'ollama', 'platform']);
});

test('local agent: only the caller that asks gets it, and never for embeddings', async () => {
  const platform = { baseURL: 'https://gateway.ai.cloudflare.com/v1/x/compat', apiKey: '', model: 'm' };
  const { deps } = fakes({}, platform);
  deps.resolveLocalAgent = () => ({ config: { baseURL: 'http://127.0.0.1:18088/v1', apiKey: '', model: 'default_model' }, position: 'first' });
  assert.deepEqual((await resolveOrgAiChain(ORG, 'chat', deps)).map((c) => c.source), ['platform']);
  assert.deepEqual((await resolveOrgAiChain(ORG, 'embed', deps, { localAgent: true })).map((c) => c.source), ['platform']);
});
