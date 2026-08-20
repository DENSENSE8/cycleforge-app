/**
 * Short-lived demotion cache for AI providers.
 *
 * The chain (`resolveOrgAiChain`) is a PREFERENCE. This module is what stops a
 * preference from becoming a liability: when the preferred provider times out
 * or 5xxs, it is demoted for a short window so the next request skips straight
 * to the one that works instead of re-paying the timeout every time.
 *
 * Scoped per (org, provider, capability). One tenant's self-hosted box being
 * unreachable says nothing about another tenant's, and an endpoint can serve
 * chat while its embeddings model is missing.
 *
 * Deliberately in-memory and best-effort, the same posture as
 * `redisAdvanceLock`: correctness comes from the failover loop actually trying
 * the next provider, never from this cache being accurate. A cold process
 * simply re-learns, which costs one timeout.
 *
 * DB-free and clock-injectable so the TTL is unit-testable without sleeping.
 */

import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { AiCapability } from '@/lib/ai/provider';

/**
 * How long a failed provider stays demoted.
 *
 * 60s is chosen against the measured local-model behaviour: a cold MLX load is
 * ~14s and the model unloads after a 60m TTL, so a window much longer than a
 * minute would keep a recovered box sidelined, while a much shorter one lets a
 * genuinely dead endpoint be retried on nearly every request.
 */
export const PROVIDER_DEMOTION_TTL_MS = 60_000;

/**
 * Per-provider request budget.
 *
 * **The local budget MUST exceed the ~14s cold JIT load** (measured 2026-08-19
 * on `prometheus`). A uniform short timeout would demote a perfectly healthy
 * self-hosted model on the first request after each 60m unload — turning
 * local-first into cloud-first for anyone whose box idles, which is everyone.
 * Cloud providers have no cold-start of that shape, so they fail fast.
 */
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
