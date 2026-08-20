/**
 * Which AI provider a tenant's calls try FIRST — a per-org preference,
 * local-first by default.
 *
 * Precedence mirrors `resolveSupportVisionLane` / `resolvePhotoAnalyzeProvider`
 * exactly — one shape for "which engine serves this org", so nobody has to
 * learn a second one:
 *
 *   1. the org's explicit setting  (`organizations.settings.ai.providerOrder`)
 *   2. the AI_PROVIDER_ORDER env   (deployment-wide default)
 *   3. `'local-first'`             (the LOCAL-FIRST product default)
 *
 * **The default is an inversion, and it is deliberate.** The chain used to be
 * hardcoded `ai_gateway → openai → anthropic → ollama`, i.e. a tenant with
 * their own box on the shelf still paid a cloud vendor unless they disconnected
 * everything else. Local-first asks the hardware they already own first and
 * treats cloud as the fallback. Tenants who want the opposite say so —
 * `cloud-first` is a supported answer, not a workaround.
 *
 * Order is a PREFERENCE, never a guarantee: an unconfigured or unhealthy
 * provider is skipped, so the served provider can differ from the preferred
 * one. That is why callers report `OrgAiConfig.source` rather than echoing the
 * preference back to the operator.
 *
 * Pure and DB-free; `org-provider.ts` reads the org row and builds the chain.
 */

import type { IntegrationProvider } from '@/lib/integrations/credentials';

/** The order vocabulary. */
export type AiProviderOrder = 'local-first' | 'cloud-first';

/** Local-first: with nothing configured anywhere, ask the tenant's own box first. */
const DEFAULT_AI_PROVIDER_ORDER: AiProviderOrder = 'local-first';

/**
 * The vault providers that can serve a capability, in each order.
 *
 * `ollama` is the self-hosted/custom OpenAI-compatible slot — the only local
 * one. The cloud three keep their existing relative sequence in both orders, so
 * flipping the preference moves exactly one entry and nothing else.
 */
const CLOUD_SEQUENCE: readonly IntegrationProvider[] = ['ai_gateway', 'openai', 'anthropic'];
const LOCAL_SEQUENCE: readonly IntegrationProvider[] = ['ollama'];

/** Coerce a raw string (UI value or env var) to an order, or null when it is not one. */
export function normalizeAiProviderOrder(
  raw: string | null | undefined,
): AiProviderOrder | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === 'local' || v === 'local-first' || v === 'self-hosted') return 'local-first';
  if (v === 'cloud' || v === 'cloud-first' || v === 'hosted') return 'cloud-first';
  return null;
}

export function resolveAiProviderOrder(input: {
  /** `organizations.settings.ai.providerOrder`, already parsed. */
  orgOrder: string | null | undefined;
  /** The raw AI_PROVIDER_ORDER value. */
  envOrder: string | null | undefined;
}): AiProviderOrder {
  return (
    normalizeAiProviderOrder(input.orgOrder) ??
    normalizeAiProviderOrder(input.envOrder) ??
    DEFAULT_AI_PROVIDER_ORDER
  );
}

/**
 * The provider sequence to try, most-preferred first.
 *
 * `anthropic` is dropped for `embed` because it has no embeddings API — the
 * chain must not spend a hop on a provider that cannot serve the capability.
 */
export function aiProviderSequence(
  order: AiProviderOrder,
  capability: 'chat' | 'embed',
): IntegrationProvider[] {
  const cloud = CLOUD_SEQUENCE.filter((p) => capability === 'chat' || p !== 'anthropic');
  return order === 'local-first' ? [...LOCAL_SEQUENCE, ...cloud] : [...cloud, ...LOCAL_SEQUENCE];
}
