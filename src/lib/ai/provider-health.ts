/** Short-lived demotion cache for AI providers. */

import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { AiCapability } from '@/lib/ai/provider';

/** How long a failed provider stays demoted. */
export const PROVIDER_DEMOTION_TTL_MS = 60_000;

/** Per-provider request budget. */
const PROVIDER_TIMEOUT_MS: Record<'local' | 'cloud', number> = {
  local: 45_000,
  cloud: 10_000,
};

/** `ollama` is the self-hosted/custom OpenAI-compatible slot — the only local one. */
export function providerTimeoutMs(source: IntegrationProvider | 'platform'): number {
  return source === 'ollama' ? PROVIDER_TIMEOUT_MS.local : PROVIDER_TIMEOUT_MS.cloud;
}

type Key = string;
const demotedUntil = new Map<Key, number>();

function key(orgId: string, source: string, capability: AiCapability): Key {
  return `${orgId}:${source}:${capability}`;
}

export interface HealthClock {
  now: () => number;
}
const systemClock: HealthClock = { now: () => Date.now() };

/** Demote a provider that just timed out or returned 5xx. */
export function markProviderUnhealthy(
  orgId: string,
  source: IntegrationProvider | 'platform',
  capability: AiCapability,
  clock: HealthClock = systemClock,
  ttlMs: number = PROVIDER_DEMOTION_TTL_MS,
): void {
  demotedUntil.set(key(orgId, source, capability), clock.now() + ttlMs);
}

/** Whether a provider is currently demoted. Expired entries are swept on read. */
export function isProviderDemoted(
  orgId: string,
  source: IntegrationProvider | 'platform',
  capability: AiCapability,
  clock: HealthClock = systemClock,
): boolean {
  const k = key(orgId, source, capability);
  const until = demotedUntil.get(k);
  if (until === undefined) return false;
  if (clock.now() >= until) {
    demotedUntil.delete(k);
    return false;
  }
  return true;
}

/** A provider that answered is trusted again immediately. */
export function markProviderHealthy(
  orgId: string,
  source: IntegrationProvider | 'platform',
  capability: AiCapability,
): void {
  demotedUntil.delete(key(orgId, source, capability));
}

/** Test seam — never call from app code. */
export function __resetProviderHealth(): void {
  demotedUntil.clear();
}
