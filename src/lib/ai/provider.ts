/**
 * AI provider config layer — the single place that resolves WHERE an AI
 * capability call goes and WHICH model serves it.
 *
 * Locked decision (docs/ai-search-modernization-plan.md, 2026-07-03):
 * every LLM + embedding call resolves `{ baseURL, apiKey, model }` per
 * capability from env. Hermes local is the dev config; Vercel AI Gateway is
 * the prod default. Never hardcode a provider URL or model name outside this
 * module — callers ask for a capability, not a vendor.
 *
 * Env sets (all OpenAI wire format — the gateway erases provider dialects):
 *   chat  → AI_CHAT_BASE_URL  / AI_CHAT_MODEL  / AI_CHAT_API_KEY
 *   embed → AI_EMBED_BASE_URL / AI_EMBED_MODEL / AI_EMBED_API_KEY
 *
 * This module is the PLATFORM DEFAULT LEAF only. Tenant paths must resolve
 * through `resolveOrgAiConfig(orgId, capability)` (org-provider.ts), which
 * falls through to here when an org has connected nothing of its own.
 *
 * The legacy HERMES_API_URL / HERMES_MODEL / AI_MODEL / HERMES_API_KEY
 * fallback was REMOVED with hermes-client.ts. Two env sets for one capability
 * meant setting the modern vars appeared to configure the app while the legacy
 * path ignored them — the pair agreed only because both happened to point at
 * the same box. Configure AI_CHAT_* explicitly.
 *
 * NOTE: deliberately NOT `import 'server-only'` — DB-free unit tests import
 * this module under node:test. Nothing here touches the DOM or leaks secrets
 * client-side as long as it is only imported from server code (same posture
 * as src/lib/feature-flags.ts).
 */

export type AiCapability = 'chat' | 'embed';

export interface AiProviderConfig {
  /** OpenAI-compatible API root (e.g. https://ai-gateway.vercel.sh/v1), no trailing slash. */
  baseURL: string;
  /** '' when the endpoint needs no key (local Hermes / Ollama). */
  apiKey: string;
  /** Gateway model string (e.g. anthropic/claude-haiku-4-5) or local model id. */
  model: string;
  /**
   * Extra request headers the endpoint needs BESIDES bearer auth — today only
   * Cloudflare Access (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) in
   * front of a tunnelled self-hosted model.
   *
   * This exists because an edge gateway's auth is a property of the ENDPOINT,
   * not of the model or the key, so it cannot ride on `apiKey`. It is omitted
   * (not `{}`) when there is nothing to send, so a caller can spread it
   * unconditionally.
   *
   * Callers MUST forward it. Dropping it against a CF-protected endpoint
   * yields a Cloudflare 403 that reads like a model/auth failure — the exact
   * trap that made this field a prerequisite for retiring hermes-client
   * (docs/todo/ai-provider-consolidation-HANDOFF.md, Phase 0).
   */
  headers?: Record<string, string>;
}

/**
 * Cloudflare Access service-token headers, or undefined when unconfigured.
 *
 * Mirrors the emit rule the retired `hermes-client.getHermesHeaders()` used:
 * each header is sent only when its var is non-empty, so a half-configured
 * pair degrades to sending the half that exists rather than throwing. Kept
 * permissive on purpose — this is a passthrough, not a validator.
 */
export function resolveCloudflareAccessHeaders(
  env: ProviderEnv = process.env,
): Record<string, string> | undefined {
  const id = readEnv(env, 'CLOUDFLARE_ACCESS_CLIENT_ID');
  const secret = readEnv(env, 'CLOUDFLARE_ACCESS_CLIENT_SECRET');
  if (!id && !secret) return undefined;
  return {
    ...(id ? { 'CF-Access-Client-Id': id } : {}),
    ...(secret ? { 'CF-Access-Client-Secret': secret } : {}),
  };
}

/**
 * Cloudflare AI Gateway headers, or undefined when `CF_AIG_TOKEN` is unset.
 *
 * An authenticated gateway reads its token from `cf-aig-authorization`, not
 * `Authorization` — that header stays free for a provider key (empty
 * `AI_CHAT_API_KEY` = the gateway's stored BYOK key serves the call). The
 * explicit browser-class `User-Agent` keeps Cloudflare's WAF (error 1010) from
 * reading a bare runtime default as a bot signature.
 */
function resolveCloudflareAiGatewayHeaders(
  env: ProviderEnv,
): Record<string, string> | undefined {
  const token = readEnv(env, 'CF_AIG_TOKEN');
  if (!token) return undefined;
  return {
    'cf-aig-authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (compatible; CycleForge/1.0)',
  };
}

/** Injectable env record so unit tests never mutate process.env. */
export type ProviderEnv = Record<string, string | undefined>;

/**
 * Pinned embedding dimensionality. 768 keeps `vector(768)` interchangeable
 * between prod (`openai/text-embedding-3-small` with `dimensions: 768`) and
 * dev (`nomic-embed-text`, natively 768) — a provider flip is a re-embed job,
 * never a schema change. Do NOT confuse with the 1536-dim RAG tables.
 */
export const EMBEDDING_DIMS = 768;

/** Prod default via AI Gateway — only on the explicit "Ask AI" path, never inline per keystroke. */
const CHAT_DEFAULT_MODEL = 'anthropic/claude-haiku-4-5';
/** Prod default; dev sets AI_EMBED_MODEL=nomic-embed-text against a local Ollama base URL. */
const EMBED_DEFAULT_MODEL = 'openai/text-embedding-3-small';

function readEnv(env: ProviderEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Resolve the provider config for a capability. Throws a loud, actionable
 * error naming the missing env vars when the capability is requested but
 * unconfigured — never a silent empty-string fetch to nowhere.
 */
export function resolveAiConfig(
  capability: AiCapability,
  env: ProviderEnv = process.env,
): AiProviderConfig {
  if (capability === 'chat') {
    const baseURL = readEnv(env, 'AI_CHAT_BASE_URL');
    if (!baseURL) {
      throw new Error(
        'AI "chat" capability requested but not configured. Set AI_CHAT_BASE_URL ' +
          '(+ AI_CHAT_MODEL, AI_CHAT_API_KEY). Per-tenant providers are connected ' +
          'in Settings → AI and resolve through resolveOrgAiConfig instead.',
      );
    }
    const headers = {
      ...resolveCloudflareAccessHeaders(env),
      ...resolveCloudflareAiGatewayHeaders(env),
    };
    return {
      baseURL: stripTrailingSlash(baseURL),
      apiKey: readEnv(env, 'AI_CHAT_API_KEY'),
      model: readEnv(env, 'AI_CHAT_MODEL') || CHAT_DEFAULT_MODEL,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }

  const baseURL = readEnv(env, 'AI_EMBED_BASE_URL');
  if (!baseURL) {
    throw new Error(
      'AI "embed" capability requested but not configured. Set AI_EMBED_BASE_URL ' +
        '(+ AI_EMBED_MODEL, AI_EMBED_API_KEY). Prod: Vercel AI Gateway with ' +
        `${EMBED_DEFAULT_MODEL} @ ${EMBEDDING_DIMS} dims; dev: a local Ollama ` +
        'endpoint with nomic-embed-text.',
    );
  }
  return {
    baseURL: stripTrailingSlash(baseURL),
    apiKey: readEnv(env, 'AI_EMBED_API_KEY'),
    model: readEnv(env, 'AI_EMBED_MODEL') || EMBED_DEFAULT_MODEL,
  };
}

/**
 * The PLATFORM's Anthropic key, or '' when unset.
 *
 * Separate from `resolveAiConfig` because the assistant's agent loop speaks
 * Anthropic's NATIVE tool-use API, not the OpenAI wire format the rest of this
 * module resolves — the two are different protocols, not two URLs.
 *
 * Lives here so provider.ts remains the single module in `src/` that reads an
 * AI credential from env (enforced by the no-restricted-syntax rule in
 * eslint.config.mjs). Tenant paths must prefer the org's OWN vault key and
 * treat this only as the last-resort platform default.
 */
export function resolvePlatformAnthropicKey(env: ProviderEnv = process.env): string {
  return readEnv(env, 'ANTHROPIC_API_KEY');
}

/** mlx_lm.server keeps its CLI `--adapter-path` only for this model id; any other id loads bare base weights. */
const LOCAL_AGENT_DEFAULT_MODEL = 'default_model';

/** Where the local agent sits in the assistant chain: ahead of everything, or right behind the platform leaf. */
export type LocalAgentPosition = 'first' | 'fallback';

export interface LocalAgentConfig {
  config: AiProviderConfig;
  position: LocalAgentPosition;
}

/**
 * The env-selected LOCAL AGENT model, or null when it is not switched on.
 *
 *   CYCLEFORGE_LOCAL_MLX=1 | first            local model answers first
 *   CYCLEFORGE_LOCAL_MLX=fallback             platform (`AI_CHAT_*`) first, local
 *                                             model catches its failures (quota 429, 5xx)
 *   (anything else)                           off
 *   LOCAL_MLX_BASE_URL=http://127.0.0.1:18088/v1   loopback / ssh -L tunnel
 *   LOCAL_MLX_MODEL=default_model             optional; keep the default for a LoRA
 *
 * This is a slot for the assistant TOOL LOOP only (a tool-calling fine-tune
 * such as the gpt-oss CycleForge adapter on Prometheus): it rides
 * `resolveOrgAiChain(..., { localAgent: true })`, which only
 * `/api/assistant/chat` passes, because only that loop speaks the model's wire
 * (Harmony channels, text-salvaged tool calls). Every other chat caller
 * (titles, suggest-reply, search) never sees it. Runbook:
 * docs/integrations/realtime-ai.md → "Local agent model (Prometheus MLX)".
 */
export function resolveLocalAgentConfig(env: ProviderEnv = process.env): LocalAgentConfig | null {
  const flag = readEnv(env, 'CYCLEFORGE_LOCAL_MLX').toLowerCase();
  const position: LocalAgentPosition | null =
    flag === '1' || flag === 'first' ? 'first' : flag === 'fallback' ? 'fallback' : null;
  const baseURL = readEnv(env, 'LOCAL_MLX_BASE_URL');
  if (!position || !baseURL) return null;
  return {
    position,
    config: {
      baseURL: stripTrailingSlash(baseURL),
      apiKey: '',
      model: readEnv(env, 'LOCAL_MLX_MODEL') || LOCAL_AGENT_DEFAULT_MODEL,
    },
  };
}

/**
 * Build the request headers for an OpenAI-wire call against a resolved config.
 *
 * Replaces the retired `hermes-client.getHermesHeaders()`. Layer order is
 * load-bearing:
 *   1. `content-type` (overridable by `extra`)
 *   2. `Authorization: Bearer <apiKey>` — the MODEL's credential, omitted when
 *      the endpoint needs none (local Hermes / Ollama)
 *   3. `config.headers` — the ENDPOINT's credential (Cloudflare Access)
 *   4. `extra` — per-call routing/telemetry headers (session id, source)
 *
 * 2 and 3 are different credentials for different hops and must both be sent;
 * an endpoint behind CF Access rejects a request carrying only the bearer with
 * a 403 that reads like a model auth failure.
 */
export function aiRequestHeaders(
  config: Pick<AiProviderConfig, 'apiKey' | 'headers'>,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...(config.headers ?? {}),
    ...(extra ?? {}),
  };
}

/**
 * Hosts of the MANAGED OpenAI-wire endpoints this app resolves. Anything else
 * a chain can produce is a self-hosted runtime (LM Studio, mlx-dspark, Ollama,
 * llama.cpp, vLLM) reached directly or through a tunnel.
 */
const MANAGED_AI_HOSTS = new Set([
  'ai-gateway.vercel.sh',
  'api.openai.com',
  'api.anthropic.com',
  'cli-chat-proxy.grok.com',
  'api.x.ai',
  'gateway.ai.cloudflare.com',
]);

/**
 * Whether a resolved endpoint is a SELF-HOSTED OpenAI-compatible runtime.
 *
 * The distinction is about what the endpoint tolerates in the request BODY,
 * which is why it cannot be read off `source`: the platform env set
 * (`AI_CHAT_BASE_URL`) is Vercel AI Gateway in prod and a local box in dev, and
 * both report `source: 'platform'`.
 *
 * Managed endpoints reject unknown body params with a 400. Local runtimes take
 * runtime-specific ones — `chat_template_kwargs` above all, which is the only
 * way to turn OFF a reasoning model's think phase. A reasoning model that
 * thinks inside a forced-tool call spends the whole `max_tokens` budget on the
 * think phase and returns `finish_reason: "length"` with no tool call at all,
 * so this is not a nicety (see `hermes-tool-call.ts`).
 *
 * Unparseable URLs answer `false` — the conservative half, since a managed
 * endpoint is the one that errors on an extra field.
 */
export function isSelfHostedAiRuntime(config: Pick<AiProviderConfig, 'baseURL'>): boolean {
  try {
    return !MANAGED_AI_HOSTS.has(new URL(config.baseURL).hostname);
  } catch {
    return false;
  }
}

/**
 * Cheap configured-check so hot paths (keystroke search, outbox worker) can
 * skip the semantic arm gracefully instead of catching the loud error above.
 */
export function isAiConfigured(
  capability: AiCapability,
  env: ProviderEnv = process.env,
): boolean {
  if (capability === 'chat') {
    return Boolean(readEnv(env, 'AI_CHAT_BASE_URL'));
  }
  return Boolean(readEnv(env, 'AI_EMBED_BASE_URL'));
}
