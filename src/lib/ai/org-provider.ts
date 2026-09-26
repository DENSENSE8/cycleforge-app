/** org-provider — per-org AI provider resolution (AI search, BYOK + metered platform default; docs/ai-search-modernization-plan.md). */

import type {
  AiGatewayCredentials,
  AnthropicCredentials,
  IntegrationProvider,
  OllamaCredentials,
  OpenAiCredentials,
} from '@/lib/integrations/credentials';
import {
  isAiConfigured,
  resolveAiConfig,
  resolvePlatformAnthropicKey,
  type AiCapability,
  type AiProviderConfig,
} from '@/lib/ai/provider';
import type { OrgId } from '@/lib/tenancy/constants';
import { aiProviderSequence, type AiProviderOrder } from '@/lib/ai/provider-order';
import { isProviderDemoted } from '@/lib/ai/provider-health';

export interface OrgAiConfig extends AiProviderConfig {
  /** Which vault provider (or 'platform') is serving this capability. */
  source: IntegrationProvider | 'platform';
}

/** Injectable collaborators (house `Deps` pattern — backend-patterns.md), so the resolution CHAIN is unit-testable with zero DB. */
export interface OrgAiDeps {
  getIntegrationCredentials: <T>(orgId: OrgId, provider: IntegrationProvider) => Promise<T | null>;
  isAiConfigured: (capability: AiCapability) => boolean;
  resolveAiConfig: (capability: AiCapability) => AiProviderConfig;
  /** This org's stored order preference (local-first by default). */
  resolveOrder: (orgId: OrgId) => Promise<AiProviderOrder>;
  /** Whether a provider is in its short post-failure demotion window. */
  isDemoted: (orgId: OrgId, source: IntegrationProvider | 'platform', capability: AiCapability) => boolean;
  /** The platform's Anthropic key (agent loop only — native tool-use protocol). */
  resolvePlatformAnthropicKey: () => string;
}

const defaultDeps: OrgAiDeps = {
  getIntegrationCredentials: async <T,>(orgId: OrgId, provider: IntegrationProvider) => {
    const mod = await import('@/lib/integrations/credentials');
    return mod.getIntegrationCredentials<T>(orgId, provider);
  },
  isAiConfigured: (capability) => isAiConfigured(capability),
  resolveAiConfig: (capability) => resolveAiConfig(capability),
  resolveOrder: async (orgId) => {
    const mod = await import('@/lib/ai/provider-order-deps');
    return mod.resolveAiProviderOrderForOrg(orgId);
  },
  isDemoted: (orgId, source, capability) => isProviderDemoted(orgId, source, capability),
  resolvePlatformAnthropicKey: () => resolvePlatformAnthropicKey(),
};

const GATEWAY_BASE = 'https://ai-gateway.vercel.sh/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
// Anthropic's OpenAI SDK-compatibility endpoint (chat completions only).
const ANTHROPIC_OPENAI_COMPAT_BASE = 'https://api.anthropic.com/v1';

const DEFAULT_CHAT_MODEL_GATEWAY = 'anthropic/claude-haiku-4-5';
const DEFAULT_EMBED_MODEL_GATEWAY = 'openai/text-embedding-3-small';
const DEFAULT_CHAT_MODEL_OPENAI = 'gpt-4o-mini';
const DEFAULT_EMBED_MODEL_OPENAI = 'text-embedding-3-small';
const DEFAULT_CHAT_MODEL_ANTHROPIC = 'claude-haiku-4-5';

/** Build ONE candidate config for a given vault provider, or null when that provider is not connected / cannot serve the capability. */
async function candidateFor(
  orgId: OrgId,
  provider: IntegrationProvider,
  capability: AiCapability,
  getIntegrationCredentials: OrgAiDeps['getIntegrationCredentials'],
): Promise<OrgAiConfig | null> {
  switch (provider) {
    case 'ai_gateway': {
      const c = await getIntegrationCredentials<AiGatewayCredentials>(orgId, 'ai_gateway');
      if (!c?.apiKey) return null;
      return {
        source: 'ai_gateway',
        baseURL: GATEWAY_BASE,
        apiKey: c.apiKey,
        model:
          capability === 'chat'
            ? c.chatModel || DEFAULT_CHAT_MODEL_GATEWAY
            : c.embedModel || DEFAULT_EMBED_MODEL_GATEWAY,
      };
    }
    case 'openai': {
      const c = await getIntegrationCredentials<OpenAiCredentials>(orgId, 'openai');
      if (!c?.apiKey) return null;
      return {
        source: 'openai',
        baseURL: OPENAI_BASE,
        apiKey: c.apiKey,
        model:
          capability === 'chat'
            ? c.chatModel || DEFAULT_CHAT_MODEL_OPENAI
            : c.embedModel || DEFAULT_EMBED_MODEL_OPENAI,
      };
    }
    case 'anthropic': {
      // Chat only — no embeddings API. `aiProviderSequence` already drops it
      // for embed; this stays as a second belt so a hand-built order cannot
      // route an embed call somewhere that has no endpoint for it.
      if (capability !== 'chat') return null;
      const c = await getIntegrationCredentials<AnthropicCredentials>(orgId, 'anthropic');
      if (!c?.apiKey) return null;
      return {
        source: 'anthropic',
        baseURL: ANTHROPIC_OPENAI_COMPAT_BASE,
        apiKey: c.apiKey,
        model: c.chatModel || DEFAULT_CHAT_MODEL_ANTHROPIC,
      };
    }
    case 'ollama': {
      const c = await getIntegrationCredentials<OllamaCredentials>(orgId, 'ollama');
      if (!c?.baseUrl) return null;
      const model = capability === 'chat' ? c.model : c.embedModel;
      if (!model) return null;
      // A self-hosted endpoint is usually reached through a tunnel fronted by Cloudflare Access, whose service token is an endpoint property and…
      const cfHeaders = {
        ...(c.cfAccessClientId ? { 'CF-Access-Client-Id': c.cfAccessClientId } : {}),
        ...(c.cfAccessClientSecret ? { 'CF-Access-Client-Secret': c.cfAccessClientSecret } : {}),
      };
      return {
        source: 'ollama',
        baseURL: (c.tunnelUrl || c.baseUrl).replace(/\/+$/, ''),
        apiKey: c.apiKey ?? '',
        model,
        ...(Object.keys(cfHeaders).length ? { headers: cfHeaders } : {}),
      };
    }
    default:
      return null;
  }
}

/** The ordered candidate chain for an org + capability, most-preferred first. */
export async function resolveOrgAiChain(
  orgId: OrgId,
  capability: AiCapability,
  deps: OrgAiDeps = defaultDeps,
): Promise<OrgAiConfig[]> {
  const { getIntegrationCredentials } = deps;
  const chain: OrgAiConfig[] = [];

  try {
    const order = await deps.resolveOrder(orgId);
    for (const provider of aiProviderSequence(order, capability)) {
      const candidate = await candidateFor(orgId, provider, capability, getIntegrationCredentials);
      if (candidate) chain.push(candidate);
    }
  } catch {
    // Vault / settings unavailable → fall through to the platform default.
  }

  if (deps.isAiConfigured(capability)) {
    chain.push({ source: 'platform', ...deps.resolveAiConfig(capability) });
  }

  // Demoted providers keep their relative order but sink below healthy ones.
  try {
    const healthy = chain.filter((c) => !deps.isDemoted(orgId, c.source, capability));
    const demoted = chain.filter((c) => deps.isDemoted(orgId, c.source, capability));
    return [...healthy, ...demoted];
  } catch {
    return chain;
  }
}

/** The provider a call should try FIRST, or null when nothing can serve it. */
export async function resolveOrgAiConfig(
  orgId: OrgId,
  capability: AiCapability,
  deps: OrgAiDeps = defaultDeps,
): Promise<OrgAiConfig | null> {
  const chain = await resolveOrgAiChain(orgId, capability, deps);
  return chain[0] ?? null;
}

/** Resolve the Anthropic-native brain behind the assistant agent loop. */
export async function resolveOrgAnthropicBrain(
  orgId: OrgId,
  deps: OrgAiDeps = defaultDeps,
): Promise<{ apiKey: string; model: string | null; source: 'anthropic' | 'platform' } | null> {
  try {
    const c = await deps.getIntegrationCredentials<AnthropicCredentials>(orgId, 'anthropic');
    if (c?.apiKey) {
      return { apiKey: c.apiKey, model: c.chatModel ?? null, source: 'anthropic' };
    }
  } catch {
    // Vault unavailable → fall through to the platform key.
  }
  const platform = deps.resolvePlatformAnthropicKey();
  return platform ? { apiKey: platform, model: null, source: 'platform' } : null;
}

/** Cheap capability check for hot paths (skip the semantic arm entirely). */
export async function isOrgAiConfigured(
  orgId: OrgId,
  capability: AiCapability,
  deps: OrgAiDeps = defaultDeps,
): Promise<boolean> {
  return (await resolveOrgAiConfig(orgId, capability, deps)) !== null;
}
