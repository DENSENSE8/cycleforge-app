/**
 * pi-provider — the ONE place the org AI vault and pi-ai's model vocabulary
 * meet.
 *
 * The vault (`resolveOrgAiChain`) speaks `{ baseURL, apiKey, model, headers,
 * source }`. pi-ai speaks `Provider` + `Model<Api>` inside a `Models`
 * collection. This module translates one into the other and nothing else: no
 * turn loop, no tool dispatch, no persistence. Callers that want a turn go
 * through `src/lib/assistant/pi-agent-loop.ts`, which imports `orgModels()`
 * from here.
 *
 * Why this bridge exists at all: today the assistant carries TWO hand-written
 * turn loops — `agent-loop.ts` (Anthropic native tool-use blocks) and
 * `grok-agent-loop.ts` (OpenAI function-calling wire). They differ only in
 * wire shape. pi-ai picks the wire from `model.api`, so once a vault config
 * becomes a pi-ai `Model`, the caller stops needing an Anthropic-shaped loop
 * beside an OpenAI-shaped loop.
 *
 * Capability: reports and chat use `AiCapability` `'chat'`. Embeddings are
 * NOT this module's job — pi-ai here is a *chat/tool-use* transport only.
 * Never route `'embed'` through `orgModels()`; embeddings stay on
 * `src/lib/ai/embed.ts` against the OpenAI-compatible embeddings endpoint,
 * which pi-ai's message APIs do not model.
 *
 * Tenancy: `orgId` comes from the authenticated request context and is passed
 * straight through to the vault. This module adds NO credential store of its
 * own — see the `createModels()` call below.
 */

import type * as PiAi from '@earendil-works/pi-ai';
import type {
  Api,
  Model,
  MutableModels,
  Provider,
  ProviderStreams,
} from '@earendil-works/pi-ai';

// `@earendil-works/pi-ai` is ESM-only: its package `exports` map declares an
// `import` condition and NO `require`, so a top-level VALUE import of the root
// fails to resolve under any CJS-flavoured loader — including `tsx --test`,
// which is how every unit test in this repo runs. Types are erased, so those
// stay static above; the two runtime factories load through a memoized dynamic
// import. Same shape as `org-provider.ts`'s lazy vault import, and it keeps a
// ~90 MB dependency off the module graph of anything that only wants a type.
let piAiRoot: Promise<typeof PiAi> | null = null;
function loadPiAi(): Promise<typeof PiAi> {
  piAiRoot ??= import('@earendil-works/pi-ai');
  return piAiRoot;
}

import { resolveOrgAiChain, type OrgAiConfig } from '@/lib/ai/org-provider';
import type { AiCapability } from '@/lib/ai/provider';
import type { OrgId } from '@/lib/tenancy/constants';

type AiSource = OrgAiConfig['source'];

/**
 * Vault source → pi-ai wire protocol.
 *
 * `OrgAiConfig['source']` is `IntegrationProvider | 'platform'`, a ~20-member
 * union covering marketplaces and carriers that will never serve a model, so
 * this is a `Partial` map plus `piApiForSource()` rather than a total record
 * that would have to name `ebay` and `fedex`.
 *
 * `anthropic` is the load-bearing entry: it maps to the NATIVE
 * `anthropic-messages` protocol, not to Anthropic's OpenAI-compat shim that
 * `org-provider.ts` targets today. That single line is what makes the two
 * hand-written loops redundant — pi-ai selects the wire from `model.api`, so
 * the caller drives Anthropic and OpenAI-wire providers through the same
 * `Models.stream()` and no longer needs one loop per wire shape. The compat
 * shim also cannot carry native prompt caching or thinking blocks, which the
 * Anthropic loop depends on.
 */
export const PI_API_BY_SOURCE: Partial<Record<AiSource, Api>> = {
  anthropic: 'anthropic-messages',
  openai: 'openai-completions',
  ai_gateway: 'openai-completions',
  grok: 'openai-completions',
  ollama: 'openai-completions',
  platform: 'openai-completions',
};

/**
 * The wire for a vault source. Unmapped sources default to
 * `'openai-completions'` because every endpoint the vault can hand us is
 * either that or the one Anthropic exception above: `ollama` doubles as the
 * generic self-hosted OpenAI-compatible slot, the gateway and Grok proxy are
 * OpenAI-shaped, and a future BYOK provider that speaks the OpenAI wire needs
 * no edit here. A source that genuinely speaks a third protocol must be added
 * to the map — silently defaulting is correct for OpenAI-compatible endpoints
 * and would fail loudly (HTTP 404 on `/chat/completions`) for anything else.
 */
export function piApiForSource(source: AiSource): Api {
  return PI_API_BY_SOURCE[source] ?? 'openai-completions';
}

/** Human label for status surfaces and pi-ai error messages. */
const SOURCE_LABELS: Partial<Record<AiSource, string>> = {
  anthropic: 'Anthropic (org vault)',
  openai: 'OpenAI (org vault)',
  ai_gateway: 'Vercel AI Gateway (org vault)',
  grok: 'Grok / SuperGrok (org vault)',
  ollama: 'Self-hosted OpenAI-compatible (org vault)',
  platform: 'Platform default (metered)',
};

/** The `AuthResult.source` label pi-ai shows for a vault-carried key. */
export const ORG_VAULT_AUTH_SOURCE = 'org vault';

/**
 * The vault carries no per-model metadata (no context window, no max output,
 * no pricing) — it stores a base URL, a key, a model id and headers. These are
 * declared conservative floors, deliberately NOT looked up in pi-ai's own
 * model catalog: that catalog is a SECOND source of truth about which models
 * an org may call, and consulting it means network access plus a `~/.pi`
 * cache. `contextWindow` only gates pi-ai's own overflow clamping, and
 * `maxTokens` is a per-request ceiling a caller can raise via stream options.
 */
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 8_192;

/** Zero cost: usage accounting is the platform's (`src/lib/ai/usage.ts`), not pi-ai's. */
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

/**
 * The adapter modules are reached by dynamic import for the same reason the
 * root is: NOTHING in this package is statically importable from a
 * CJS-flavoured loader. Its `exports` map declares only `types` + `import` for
 * every entry — root, `./api/*`, `./providers/*` alike — so `tsx --test`
 * (which resolves with `require` conditions) fails on any static specifier.
 * Dynamic `import()` goes through the ESM resolver, which honours `import`.
 *
 * Each factory is itself thin — `() => lazyApi(() => import('./<adapter>.js'))`
 * — so the real adapter still loads on first stream, not on provider build.
 */
const API_LOADERS: Partial<Record<Api, () => Promise<() => ProviderStreams>>> = {
  'openai-completions': async () =>
    (await import('@earendil-works/pi-ai/api/openai-completions.lazy')).openAICompletionsApi,
  'anthropic-messages': async () =>
    (await import('@earendil-works/pi-ai/api/anthropic-messages.lazy')).anthropicMessagesApi,
};

async function providerStreamsFor(api: Api): Promise<ProviderStreams> {
  const load = API_LOADERS[api];
  if (!load) {
    throw new Error(`pi-provider: no pi-ai API implementation wired for "${api}"`);
  }
  return (await load())();
}

/** Build ONE pi-ai provider (with its single model) from ONE vault config. */
export async function providerForConfig(config: OrgAiConfig): Promise<Provider> {
  const { createProvider } = await loadPiAi();
  const api = piApiForSource(config.source);

  // The vault's `baseURL` is an OpenAI-compatible API ROOT, i.e. it already
  // ends in `/v1` (`https://api.anthropic.com/v1`). pi-ai's
  // `anthropic-messages` adapter hands `model.baseUrl` to the Anthropic SDK,
  // which appends `/v1/messages` itself — the stored root would produce
  // `/v1/v1/messages`. Strip the version segment for the native wire only;
  // the OpenAI-completions adapter wants the root exactly as stored.
  const baseUrl =
    api === 'anthropic-messages' ? config.baseURL.replace(/\/+v1\/*$/, '') : config.baseURL;

  // Cloudflare Access service-token headers (`CF-Access-Client-Id/Secret`) and
  // the Grok proxy's headers ride on `OrgAiConfig.headers`; dropping them 403s
  // every tunnelled self-hosted endpoint, and the failure reads like a model
  // error rather than an auth error.
  //
  // They are attached in TWO places on purpose, both verified against pi-ai's
  // request path: `Provider.headers` is metadata only (status/inspection),
  // while `Models.getAuth(model)` merges `Model.headers` into the resolved
  // request auth — the model copy is the one that reaches the wire.
  const headers =
    config.headers && Object.keys(config.headers).length > 0 ? { ...config.headers } : undefined;

  const model: Model<Api> = {
    id: config.model,
    name: config.model,
    api,
    provider: config.source,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { ...NO_COST },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    ...(headers ? { headers } : {}),
  };

  return createProvider<Api>({
    id: config.source,
    name: SOURCE_LABELS[config.source] ?? `${config.source} (org vault)`,
    baseUrl,
    headers,
    auth: {
      apiKey: {
        name: SOURCE_LABELS[config.source] ?? config.source,
        async login() {
          // An interactive login on a multi-tenant server would prompt on the
          // SERVER and write a credential with no organization scope — a
          // cross-tenant credential write. Keys only ever arrive from the
          // KMS-encrypted org vault, keyed by organization_id.
          throw new Error(
            `pi-provider: interactive login is not supported. AI credentials for "${config.source}" ` +
              'come from the organization integrations vault (organization_integrations); ' +
              'connect the provider in Settings → Integrations instead.',
          );
        },
        async resolve() {
          // Always a resolved result, never `undefined`: an empty apiKey is a
          // KEYLESS local endpoint (self-hosted Ollama / Hermes behind a
          // tunnel), which is configured. Returning undefined here would make
          // pi-ai report the provider unconfigured and refuse to stream.
          return {
            auth: {
              apiKey: config.apiKey,
              ...(headers ? { headers } : {}),
            },
            source: ORG_VAULT_AUTH_SOURCE,
          };
        },
      },
    },
    models: [model],
    api: await providerStreamsFor(api),
  });
}

export interface OrgModels {
  /** The pi-ai collection, one provider per distinct chain source. */
  models: MutableModels;
  /** The vault chain, most-preferred first, exactly as resolved. */
  chain: OrgAiConfig[];
  /**
   * The model+config to run. With a `source`, that chain entry; without, the
   * head of the chain. `null` when nothing can serve the capability — the same
   * degrade-don't-throw posture as `resolveOrgAiConfig`.
   */
  pick(source?: string): { model: Model<Api>; config: OrgAiConfig } | null;
}

export interface OrgModelsDeps {
  resolveChain?: typeof resolveOrgAiChain;
}

/**
 * Every provider this org can use for `capability`, as a pi-ai `Models`
 * collection plus the vault chain that produced it.
 */
export async function orgModels(
  orgId: OrgId,
  capability: AiCapability,
  deps: OrgModelsDeps = {},
): Promise<OrgModels> {
  const chain = await (deps.resolveChain ?? resolveOrgAiChain)(orgId, capability);

  // No `credentials` store on purpose. pi-ai's default `CredentialStore` is
  // process-local and in-memory, and the file-backed one writes
  // `~/.pi/agent/auth.json` — single-user, machine-global, unscoped by org. On
  // a multi-tenant server that is a SECOND credential store beside the
  // KMS-encrypted org vault, and the first one to disagree wins silently.
  // Omitting it keeps `resolve()` above the only path a key travels.
  const { createModels } = await loadPiAi();
  const models = createModels();

  const seen = new Set<string>();
  for (const config of chain) {
    // First wins: the chain is preference-ordered, and `setProvider` upserts
    // by id, so a later duplicate source would silently demote the preferred
    // entry's config.
    if (seen.has(config.source)) continue;
    seen.add(config.source);
    models.setProvider(await providerForConfig(config));
  }

  return {
    models,
    chain,
    pick(source?: string) {
      const config = source ? chain.find((entry) => entry.source === source) : chain[0];
      if (!config) return null;
      const model = models.getModel(config.source, config.model);
      return model ? { model, config } : null;
    },
  };
}
