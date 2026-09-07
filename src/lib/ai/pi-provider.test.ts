/**
 * DB-free unit tests for the org-vault → pi-ai bridge.
 *
 * Two things are load-bearing here and neither is reachable from a mock of
 * pi-ai:
 *
 *   1. `auth.apiKey.resolve()` must report a KEYLESS endpoint as configured.
 *      pi-ai treats an `undefined` resolution as "provider not configured"
 *      and refuses to stream, which would silently kill every self-hosted
 *      Ollama/Hermes org (apiKey `''`).
 *   2. `Model.headers` must carry `OrgAiConfig.headers`. `Provider.headers` is
 *      metadata only in pi-ai; the request path merges the MODEL's headers
 *      into resolved auth. Attaching them to the provider alone drops the
 *      Cloudflare Access service token and 403s the tunnelled endpoint.
 *
 * The stream test uses pi-ai's own `fauxProvider` as transport, registered on
 * the SAME `Models` collection this module builds, so it proves the bridge
 * hands back a collection a turn loop can actually drive — without a network.
 *
 * Run: node --conditions=import --import tsx \
 *        --import ./scripts/register-server-only-shim.cjs \
 *        --test src/lib/ai/pi-provider.test.ts
 *
 * `--conditions=import` is REQUIRED, not decoration. `@earendil-works/pi-ai`
 * publishes an ESM-only exports map (`types` + `import`, no `require`), and
 * tsx loads a `.ts` file under this repo's CJS-typed root package.json as
 * CommonJS — so Node's CJS resolver finds no matching condition and throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED before any test runs. Adding `import` to the
 * user conditions lets the CJS resolver pick the ESM entry, which Node then
 * loads through require(esm). Same ESM-only constraint that put pi-ai in
 * `serverExternalPackages` in next.config.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
// Nothing in `@earendil-works/pi-ai` is statically importable under
// `tsx --test`: every `exports` entry declares only `types` + `import`, and the
// test loader resolves with `require` conditions. Dynamic `import()` uses the
// ESM resolver, which honours `import`. Types are erased, so naming the root
// for them is safe.
import type { AssistantMessageEvent, Context } from '@earendil-works/pi-ai';

type FauxModule = typeof import('@earendil-works/pi-ai/providers/faux');
let fauxModule: Promise<FauxModule> | null = null;
function loadFaux(): Promise<FauxModule> {
  fauxModule ??= import('@earendil-works/pi-ai/providers/faux');
  return fauxModule;
}
import {
  ORG_VAULT_AUTH_SOURCE,
  orgModels,
  piApiForSource,
  providerForConfig,
  PI_API_BY_SOURCE,
} from './pi-provider';
import type { OrgAiConfig } from './org-provider';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-under-test' as OrgId;

const CF_HEADERS = {
  'CF-Access-Client-Id': 'client-id.access',
  'CF-Access-Client-Secret': 'client-secret',
};

/** ollama keyless + ai_gateway + anthropic, in preference order. */
const CHAIN: OrgAiConfig[] = [
  {
    source: 'ollama',
    baseURL: 'https://hermes.example.internal/v1',
    apiKey: '',
    model: 'hermes-4-70b',
    headers: CF_HEADERS,
  },
  {
    source: 'ai_gateway',
    baseURL: 'https://ai-gateway.vercel.sh/v1',
    apiKey: 'gw-key',
    model: 'anthropic/claude-haiku-4-5',
  },
  {
    source: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    apiKey: 'sk-ant-vault',
    model: 'claude-haiku-4-5',
  },
];

/** Injected vault fake — no DB, no KMS, no env. */
function fakeChain(chain: OrgAiConfig[]) {
  const asked: { orgId: OrgId; capability: string }[] = [];
  const resolveChain = async (orgId: OrgId, capability: 'chat' | 'embed') => {
    asked.push({ orgId, capability });
    return chain;
  };
  return { resolveChain, asked };
}

test('one pi-ai provider per chain source, chain preserved', async () => {
  const { resolveChain, asked } = fakeChain(CHAIN);
  const built = await orgModels(ORG, 'chat', { resolveChain });

  assert.deepEqual(asked, [{ orgId: ORG, capability: 'chat' }]);
  assert.deepEqual(
    built.models.getProviders().map((provider) => provider.id).sort(),
    ['ai_gateway', 'anthropic', 'ollama'],
  );
  assert.deepEqual(
    built.chain.map((entry) => entry.source),
    ['ollama', 'ai_gateway', 'anthropic'],
  );
});

test('anthropic takes the native wire, everything else openai-completions', async () => {
  const { resolveChain } = fakeChain(CHAIN);
  const built = await orgModels(ORG, 'chat', { resolveChain });

  assert.equal(built.models.getModel('anthropic', 'claude-haiku-4-5')?.api, 'anthropic-messages');
  assert.equal(
    built.models.getModel('ai_gateway', 'anthropic/claude-haiku-4-5')?.api,
    'openai-completions',
  );
  assert.equal(built.models.getModel('ollama', 'hermes-4-70b')?.api, 'openai-completions');

  assert.equal(PI_API_BY_SOURCE.anthropic, 'anthropic-messages');
  assert.equal(piApiForSource('platform'), 'openai-completions');
  // A vault source that will never serve a model still answers, defaulting to
  // the OpenAI wire rather than throwing at map-lookup time.
  assert.equal(piApiForSource('ebay'), 'openai-completions');
});

test('native anthropic base url drops the compat /v1 the SDK re-appends', async () => {
  assert.equal((await providerForConfig(CHAIN[2])).getModels()[0].baseUrl, 'https://api.anthropic.com');
  // OpenAI-wire endpoints keep the stored root verbatim.
  assert.equal(
    (await providerForConfig(CHAIN[1])).getModels()[0].baseUrl,
    'https://ai-gateway.vercel.sh/v1',
  );
});

test('vault headers survive onto both the provider and the model', async () => {
  const provider = await providerForConfig(CHAIN[0]);
  assert.deepEqual(provider.headers, CF_HEADERS);
  // The model copy is the one pi-ai merges into request auth.
  assert.deepEqual(provider.getModels()[0].headers, CF_HEADERS);

  // No headers configured → no empty header object left behind.
  assert.equal((await providerForConfig(CHAIN[1])).headers, undefined);
  assert.equal((await providerForConfig(CHAIN[1])).getModels()[0].headers, undefined);
});

test('apiKey auth resolves the vault key; keyless still reports configured', async () => {
  const signal = new AbortController().signal;
  const ctx = { env: async () => undefined, fileExists: async () => false };

  const gateway = (await providerForConfig(CHAIN[1])).auth.apiKey;
  assert.ok(gateway);
  const gatewayAuth = await gateway.resolve({ ctx, credential: undefined, signal });
  assert.equal(gatewayAuth?.auth.apiKey, 'gw-key');
  assert.equal(gatewayAuth?.source, ORG_VAULT_AUTH_SOURCE);

  const keyless = (await providerForConfig(CHAIN[0])).auth.apiKey;
  assert.ok(keyless);
  const keylessAuth = await keyless.resolve({ ctx, credential: undefined, signal });
  // Configured, not undefined: pi-ai refuses to stream for an unconfigured
  // provider, and a keyless local server is legitimately configured.
  assert.notEqual(keylessAuth, undefined);
  assert.equal(keylessAuth?.auth.apiKey, '');
  assert.deepEqual(keylessAuth?.auth.headers, CF_HEADERS);
});

test('interactive login is refused — keys only come from the org vault', async () => {
  const apiKey = (await providerForConfig(CHAIN[2])).auth.apiKey;
  assert.ok(apiKey?.login);
  await assert.rejects(
    apiKey.login({ signal: new AbortController().signal, prompt: async () => '', notify: () => {} }),
    /organization integrations vault/,
  );
});

test('pick() defaults to the chain head and honours an explicit source', async () => {
  const { resolveChain } = fakeChain(CHAIN);
  const built = await orgModels(ORG, 'chat', { resolveChain });

  const head = built.pick();
  assert.equal(head?.config.source, 'ollama');
  assert.equal(head?.model.id, 'hermes-4-70b');

  const anthropic = built.pick('anthropic');
  assert.equal(anthropic?.config.source, 'anthropic');
  assert.equal(anthropic?.model.api, 'anthropic-messages');

  assert.equal(built.pick('openai'), null);
});

test('duplicate sources: first wins, preferred config is not demoted', async () => {
  const dup: OrgAiConfig[] = [
    { source: 'ollama', baseURL: 'https://first/v1', apiKey: '', model: 'first-model' },
    { source: 'ollama', baseURL: 'https://second/v1', apiKey: 'k', model: 'second-model' },
  ];
  const { resolveChain } = fakeChain(dup);
  const built = await orgModels(ORG, 'chat', { resolveChain });

  assert.equal(built.models.getProviders().length, 1);
  assert.equal(built.models.getModel('ollama', 'first-model')?.baseUrl, 'https://first/v1');
  assert.equal(built.models.getModel('ollama', 'second-model'), undefined);
});

test('empty chain degrades: no throw, pick() is null', async () => {
  const { resolveChain } = fakeChain([]);
  const built = await orgModels(ORG, 'chat', { resolveChain });

  assert.deepEqual(built.chain, []);
  assert.deepEqual(built.models.getProviders(), []);
  assert.equal(built.pick(), null);
  assert.equal(built.pick('anthropic'), null);
});

test('the returned Models collection actually streams a tool-calling turn', async () => {
  const { resolveChain } = fakeChain(CHAIN);
  const built = await orgModels(ORG, 'chat', { resolveChain });

  // Faux transport on the SAME collection the bridge built: the real providers
  // stay registered, so this proves the collection is drivable, not a
  // stand-in one constructed by the test.
  const { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } = await loadFaux();
  const faux = fauxProvider({ tokensPerSecond: 1e6, models: [{ id: 'unified' }] });
  built.models.setProvider(faux.provider);
  assert.equal(built.models.getProviders().length, 4);

  faux.setResponses([
    fauxAssistantMessage(
      [fauxText('checking the queue'), fauxToolCall('render_artifact', { artifact: { kind: 'x' } })],
      { stopReason: 'toolUse' },
    ),
  ]);

  const context: Context = {
    systemPrompt: 'you are the ops assistant',
    messages: [{ role: 'user', content: 'how many orders are late?', timestamp: Date.now() }],
    tools: [],
  };

  const events: AssistantMessageEvent[] = [];
  for await (const event of built.models.stream(faux.getModel(), context)) {
    events.push(event);
  }

  const kinds = events.map((event) => event.type);
  assert.equal(kinds[0], 'start');
  assert.ok(kinds.includes('text_delta'));
  assert.ok(kinds.includes('toolcall_delta'));
  assert.equal(kinds.at(-1), 'done');

  const text = events.flatMap((event) => (event.type === 'text_delta' ? [event.delta] : [])).join('');
  assert.equal(text, 'checking the queue');

  const toolCall = events.flatMap((event) => (event.type === 'toolcall_end' ? [event.toolCall] : []));
  assert.equal(toolCall.length, 1);
  assert.equal(toolCall[0].name, 'render_artifact');
  assert.deepEqual(toolCall[0].arguments, { artifact: { kind: 'x' } });

  const done = events.at(-1);
  assert.equal(done?.type === 'done' ? done.reason : undefined, 'toolUse');
});
