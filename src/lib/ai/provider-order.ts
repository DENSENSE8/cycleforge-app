/** Which AI provider a tenant's calls try FIRST — a per-org preference, local-first by default. */

import type { IntegrationProvider } from '@/lib/integrations/credentials';

/** The order vocabulary. */
export type AiProviderOrder = 'local-first' | 'cloud-first';

/** Local-first: with nothing configured anywhere, ask the tenant's own box first (dev default). */
const DEFAULT_AI_PROVIDER_ORDER: AiProviderOrder = 'local-first';
/** Production default: a funded cloud vendor serves; a tenant's own box is failover. */
const PRODUCTION_AI_PROVIDER_ORDER: AiProviderOrder = 'cloud-first';

/** The vault providers that can serve a capability, in each order. */
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
  /** NODE_ENV === 'production' — flips the unset default to cloud-first. */
  production?: boolean;
}): AiProviderOrder {
  return (
    normalizeAiProviderOrder(input.orgOrder) ??
    normalizeAiProviderOrder(input.envOrder) ??
    (input.production ? PRODUCTION_AI_PROVIDER_ORDER : DEFAULT_AI_PROVIDER_ORDER)
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
