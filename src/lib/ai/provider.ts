/** AI provider config layer — the single place that resolves WHERE an AI capability call goes and WHICH model serves it. */

export type AiCapability = 'chat' | 'embed';

export interface AiProviderConfig {
  /** OpenAI-compatible API root (e.g. https://ai-gateway.vercel.sh/v1), no trailing slash. */
  baseURL: string;
  /** '' when the endpoint needs no key (local Hermes / Ollama). */
  apiKey: string;
  /** Gateway model string (e.g. anthropic/claude-haiku-4-5) or local model id. */
  model: string;
  /** Extra request headers the endpoint needs BESIDES bearer auth — today only Cloudflare Access (`CF-Access-Client-Id` /… */
  headers?: Record<string, string>;
}

/** Cloudflare Access service-token headers, or undefined when unconfigured. */
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

/** Injectable env record so unit tests never mutate process.env. */
export type ProviderEnv = Record<string, string | undefined>;

/** Pinned embedding dimensionality. */
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
    const headers = resolveCloudflareAccessHeaders(env);
    return {
      baseURL: stripTrailingSlash(baseURL),
      apiKey: readEnv(env, 'AI_CHAT_API_KEY'),
      model: readEnv(env, 'AI_CHAT_MODEL') || CHAT_DEFAULT_MODEL,
      ...(headers ? { headers } : {}),
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

/** The PLATFORM's Anthropic key, or '' when unset. */
export function resolvePlatformAnthropicKey(env: ProviderEnv = process.env): string {
  return readEnv(env, 'ANTHROPIC_API_KEY');
}

/** Build the request headers for an OpenAI-wire call against a resolved config. */
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
