/**
 * Short-lived demotion cache for AI providers.
 *
 * The in-process Map is the fast path and the fallback; when Redis is usable the
 * demotion is also written through (`SET … PX ttl` / `DEL`) so every instance
 * sinks a provider one instance just watched fail, instead of each of N
 * instances paying the same timeout before it learns.
 */

import type { AiProviderSource } from '@/lib/ai/org-provider';
import type { AiCapability } from '@/lib/ai/provider';
import { isRedisConfigured, redisPipeline } from '@/lib/redis/client';
import { isRedisCacheEnabled } from '@/lib/cache/cache-flags';

/** How long a failed provider stays demoted. */
export const PROVIDER_DEMOTION_TTL_MS = 60_000;

/** Per-provider request budget. */
const PROVIDER_TIMEOUT_MS: Record<'local' | 'cloud', number> = {
  local: 45_000,
  cloud: 10_000,
};

/** `ollama` (the self-hosted vault slot) and `local_mlx` (the env-selected local agent) are local. */
export function providerTimeoutMs(source: AiProviderSource): number {
  return source === 'ollama' || source === 'local_mlx' ? PROVIDER_TIMEOUT_MS.local : PROVIDER_TIMEOUT_MS.cloud;
}

/**
 * Ceiling on the shared read. The check sits in front of every AI call, so a
 * Redis brownout must cost at most this much before the local answer is used.
 */
export const SHARED_DEMOTION_READ_BUDGET_MS = 250;

const REDIS_PREFIX = 'aihealth:v1:';

export interface HealthClock {
  now: () => number;
}
const systemClock: HealthClock = { now: () => Date.now() };

type RedisCommand = (string | number)[];

export interface ProviderHealthDeps {
  /** One pipeline round-trip; `redisPipeline` in production. */
  pipeline: (commands: RedisCommand[]) => Promise<unknown[]>;
  /** Whether the shared store may be used right now. */
  sharedEnabled: () => boolean;
  /** Ceiling on a shared read before falling back to the local Map. */
  readBudgetMs?: number;
}

export interface ProviderHealth {
  markUnhealthy(orgId: string, source: AiProviderSource, capability: AiCapability, clock?: HealthClock, ttlMs?: number): void;
  markHealthy(orgId: string, source: AiProviderSource, capability: AiCapability): void;
  /** Local-only answer (this instance's own observations). */
  isDemoted(orgId: string, source: AiProviderSource, capability: AiCapability, clock?: HealthClock): boolean;
  /** Local fast path, then the shared store; falls back to local when the store is off, errors, or is slow. */
  isDemotedShared(orgId: string, source: AiProviderSource, capability: AiCapability, clock?: HealthClock): Promise<boolean>;
  /** Drop this instance's local Map (the shared store is untouched). */
  resetLocal(): void;
}

function key(orgId: string, source: string, capability: AiCapability): string {
  return `${orgId}:${source}:${capability}`;
}

function withBudget<T>(work: Promise<T>, ms: number): Promise<T> {
  const { promise: budget, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => reject(new Error('shared demotion read over budget')), ms);
  return Promise.race([work, budget]).finally(() => clearTimeout(timer));
}

/** Build a demotion cache over an injectable shared store (tests use a fake pipeline). */
export function createProviderHealth(deps: ProviderHealthDeps): ProviderHealth {
  const demotedUntil = new Map<string, number>();
  const readBudgetMs = deps.readBudgetMs ?? SHARED_DEMOTION_READ_BUDGET_MS;

  /** Fire-and-forget: a lost shared write only costs other instances one extra timeout. */
  function writeShared(command: RedisCommand): void {
    try {
      if (!deps.sharedEnabled()) return;
      deps.pipeline([command]).catch(() => {});
    } catch {
      // Shared store unavailable: the local Map already holds the answer.
    }
  }

  function isDemoted(
    orgId: string,
    source: AiProviderSource,
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

  return {
    markUnhealthy(orgId, source, capability, clock = systemClock, ttlMs = PROVIDER_DEMOTION_TTL_MS) {
      const k = key(orgId, source, capability);
      demotedUntil.set(k, clock.now() + ttlMs);
      writeShared(['SET', REDIS_PREFIX + k, '1', 'PX', String(ttlMs)]);
    },
    markHealthy(orgId, source, capability) {
      const k = key(orgId, source, capability);
      demotedUntil.delete(k);
      writeShared(['DEL', REDIS_PREFIX + k]);
    },
    isDemoted,
    async isDemotedShared(orgId, source, capability, clock = systemClock) {
      if (isDemoted(orgId, source, capability, clock)) return true;
      try {
        if (!deps.sharedEnabled()) return false;
        const [exists] = await withBudget(
          deps.pipeline([['EXISTS', REDIS_PREFIX + key(orgId, source, capability)]]),
          readBudgetMs,
        );
        return Number(exists) > 0;
      } catch {
        return false;
      }
    },
    resetLocal() {
      demotedUntil.clear();
    },
  };
}

/** Redis is shared state only when configured and not switched off (`REDIS_CACHE_DISABLED`). */
const defaultHealth = createProviderHealth({
  pipeline: redisPipeline,
  sharedEnabled: () => isRedisConfigured() && isRedisCacheEnabled(),
});

/** Demote a provider that just timed out or returned a provider fault. */
export function markProviderUnhealthy(
  orgId: string,
  source: AiProviderSource,
  capability: AiCapability,
  clock: HealthClock = systemClock,
  ttlMs: number = PROVIDER_DEMOTION_TTL_MS,
): void {
  defaultHealth.markUnhealthy(orgId, source, capability, clock, ttlMs);
}

/** Whether THIS instance has seen the provider fail inside the window. Expired entries are swept on read. */
export function isProviderDemoted(
  orgId: string,
  source: AiProviderSource,
  capability: AiCapability,
  clock: HealthClock = systemClock,
): boolean {
  return defaultHealth.isDemoted(orgId, source, capability, clock);
}

/** Whether ANY instance has demoted the provider (local first, then Redis; local-only when Redis is off). */
export function isProviderDemotedShared(
  orgId: string,
  source: AiProviderSource,
  capability: AiCapability,
  clock: HealthClock = systemClock,
): Promise<boolean> {
  return defaultHealth.isDemotedShared(orgId, source, capability, clock);
}

/** A provider that answered is trusted again immediately. */
export function markProviderHealthy(
  orgId: string,
  source: AiProviderSource,
  capability: AiCapability,
): void {
  defaultHealth.markHealthy(orgId, source, capability);
}

/** Test seam — never call from app code. */
export function __resetProviderHealth(): void {
  defaultHealth.resetLocal();
}
