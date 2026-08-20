/**
 * org-provider — per-org AI provider resolution (AI search, BYOK + metered
 * platform default; docs/ai-search-modernization-plan.md).
 *
 * Supersedes env-only resolution for TENANT-facing AI search calls. Chain,
 * most-specific wins:
 *
 *   1. The org's connected provider from the integrations vault
 *      (organization_integrations, KMS-encrypted, 5-min cached via
 *      getIntegrationCredentials). Priority when several are connected:
 *      ai_gateway → openai → anthropic (chat only) → ollama/self-hosted.
 *   2. The platform-metered default: the AI_CHAT_* / AI_EMBED_* env sets
 *      (Vercel AI Gateway key owned by the platform). Usage is metered per
 *      org either way; margin billing applies only to platform-carried usage.
 *   3. null — capability unavailable; callers degrade (search = keyword-only,
 *      Ask-AI = classic chat deep-link). NEVER an error on the hot path.
 *
 * All four BYOK providers speak the OpenAI wire format (Anthropic via its
 * OpenAI-compat layer, chat only — no embeddings API).
 */

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

/**
 * Injectable collaborators (house `Deps` pattern — backend-patterns.md), so
 * the resolution CHAIN is unit-testable with zero DB.
 *
 * The vault import is deliberately `import type` + a lazy `await import()`
 * inside the default: `@/lib/integrations/credentials` pulls `@/lib/db`, which
 * carries `server-only` and throws the moment it is loaded under node:test.
 * A top-level value import here would make this module untestable, which is
 * how the chain came to have no coverage in the first place.
 */
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

/**
 * Build ONE candidate config for a given vault provider, or null when that
 * provider is not connected / cannot serve the capability.
 *
 * Split out of the old first-match cascade so the ORDER lives in one place
 * (`aiProviderSequence`) instead of being implied by the sequence of `if`
 * blocks — which is how the chain came to be hardcoded cloud-first with no
 * way for a tenant to say otherwise.
 */
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
      // A self-hosted endpoint is usually reached through a tunnel fronted by
      // Cloudflare Access, whose service token is an endpoint property and so
      // cannot ride on `apiKey` (that is the model's bearer). Omit the field
      // entirely when unconfigured so callers can spread it unconditionally.
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

/**
 * The ordered candidate chain for an org + capability, most-preferred first.
 *
 * Order comes from the org's stored preference (local-first by default —
 * `provider-order.ts`), NOT from the sequence of branches in this file. The
 * platform-metered default is always last: it is the fallback of last resort,
 * never something a tenant's own connected provider loses to.
 *
 * Providers currently demoted by `provider-health` are moved to the BACK
 * rather than dropped — a chain that silently shortened itself would turn a
 * transient timeout into "AI is not configured for this workspace".
 *
 * Never throws: a vault failure yields whatever the platform default offers.
 */
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
  // Guarded: the health cache is best-effort, and this function's contract is
  // that it NEVER throws on the lookup path. An unreadable cache means "assume
  // healthy" — one wasted timeout, not a dead AI surface.
  try {
    const healthy = chain.filter((c) => !deps.isDemoted(orgId, c.source, capability));
    const demoted = chain.filter((c) => deps.isDemoted(orgId, c.source, capability));
    return [...healthy, ...demoted];
  } catch {
    return chain;
  }
}

/**
 * The provider a call should try FIRST, or null when nothing can serve it.
 *
 * Unchanged contract for every existing caller: it is the head of the chain.
 * Callers that can retry should use `resolveOrgAiChain` (or the failover
 * helper) so a timeout demotes rather than fails.
 */
export async function resolveOrgAiConfig(
  orgId: OrgId,
  capability: AiCapability,
  deps: OrgAiDeps = defaultDeps,
): Promise<OrgAiConfig | null> {
  const chain = await resolveOrgAiChain(orgId, capability, deps);
  return chain[0] ?? null;
}

/**
 * Resolve the Anthropic-native brain behind the assistant agent loop.
 *
 * **This is deliberately NOT `resolveOrgAiChain`.** That chain resolves
 * OpenAI-wire endpoints; the agent loop uses Anthropic's native tool-use API,
 * which an Ollama or Vercel-Gateway endpoint does not implement. Handing it a
 * chain entry it cannot speak to would fail at the first tool call — so the
 * brain resolves only providers that can actually serve it.
 *
 * Precedence mirrors the rest of the resolver: the org's OWN vault key first,
 * the platform key last. Before this existed the loop read
 * `process.env.ANTHROPIC_API_KEY` directly, so every tenant's assistant ran on
 * one platform key and one hardcoded model — the same single-tenant leak
 * hermes-client had, in a surface the Phase 1 sweep did not cover.
 *
 * Returns null when neither is configured; the caller degrades to its
 * OpenAI-wire fallback rather than throwing.
 */
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
