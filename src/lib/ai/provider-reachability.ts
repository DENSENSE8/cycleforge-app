/**
 * Memoized reachability probe for an OpenAI-wire AI endpoint, run at TURN time.
 *
 * This is NOT the save-time probe (`provider-probe.ts`, which is allowed to be
 * slow and chatty because a human is watching a form). This one runs on the
 * assistant's hot path: `/api/assistant/chat` has to decide whether the org's
 * fallback gateway is answering before it can pick a mouth.
 *
 * Why the cache exists: the probe is a live network round-trip with a 2s
 * ceiling, and it used to run BEFORE the SSE stream opened — so every single
 * turn paid it in time-to-first-byte, and a black-holed gateway cost the full
 * two seconds of silence on each message. The answer barely changes minute to
 * minute, so it is cached per endpoint for a short TTL.
 *
 * Keyed by base URL, not by org: two tenants pointing at the same gateway are
 * asking the same question of the same host, and the answer does not depend on
 * the API key (a 401 still means "reachable" for routing purposes — see below).
 *
 * A FAILED probe is cached too, and deliberately: an unreachable host is the
 * expensive case (it is the one that burns the whole timeout), so re-probing it
 * on every turn is exactly the behaviour worth suppressing.
 *
 * DB-free and fetch/clock-injectable so the cache policy is unit-testable
 * without network.
 */

import { aiRequestHeaders, type AiProviderConfig } from '@/lib/ai/provider';

/** How long a probe answer is trusted before the endpoint is asked again. */
export const REACHABILITY_TTL_MS = 60_000;

export interface ReachabilityDeps {
  fetchImpl?: typeof fetch;
  /** Injectable clock so the TTL is testable without sleeping. */
  now?: () => number;
}

interface CacheEntry {
  ok: boolean;
  at: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * The raw probe — moved here from the chat route unchanged: `/models` with the
 * provider's request headers, 2s abort, any throw or non-2xx is "not
 * reachable".
 */
export async function isProviderReachable(
  config: AiProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${config.baseURL}/models`, {
      headers: aiRequestHeaders(config),
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `isProviderReachable` with a per-base-URL TTL memo. Call this from request
 * paths; call the raw probe only when a caller genuinely needs a fresh answer.
 */
export async function isProviderReachableCached(
  config: AiProviderConfig,
  ttlMs: number = REACHABILITY_TTL_MS,
  deps: ReachabilityDeps = {},
): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const key = config.baseURL;
  const at = now();

  const hit = cache.get(key);
  if (hit !== undefined && at - hit.at < ttlMs) return hit.ok;

  const ok = await isProviderReachable(config, deps.fetchImpl ?? fetch);
  cache.set(key, { ok, at: now() });
  return ok;
}

/** Test seam: drop every memoized answer. */
export function resetProviderReachabilityCache(): void {
  cache.clear();
}
