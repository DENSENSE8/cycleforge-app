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

import { aiRequestHeaders, isSelfHostedAiRuntime, type AiProviderConfig } from '@/lib/ai/provider';

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
/** Probes in flight per base URL: concurrent cold callers share one round-trip. */
const inflight = new Map<string, Promise<boolean>>();

/** How long a FAILED probe is trusted. Shorter than a success on purpose. */
export const REACHABILITY_FAILURE_TTL_MS = 5_000;

/** Ceiling for the generation liveness check on a self-hosted endpoint. */
const LIVENESS_TIMEOUT_MS = 10_000;

/**
 * The raw probe: `/models` with the provider's request headers, 2s abort, any
 * throw or non-2xx is "not reachable".
 *
 * For a SELF-HOSTED endpoint that is not enough. Measured on the Mac's
 * `mlx_lm.server` (2026-09-06): the generation thread died with
 * `[METAL] Command buffer execution failed: Insufficient Memory`, and
 * `GET /v1/models` kept answering 200 every five seconds while a 16-token
 * completion never returned. The dock kept routing turns into a dead server
 * because its health check only asked the HTTP layer a question the HTTP layer
 * could answer alone. So a self-hosted endpoint must also prove it can
 * GENERATE: one token, 10s ceiling, and a timeout counts as DOWN.
 *
 * Managed gateways keep the cheap path — they bill per token and their
 * `/models` is not served by the inference process.
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
    if (!res.ok) return false;
  } catch {
    return false;
  }
  if (!isSelfHostedAiRuntime(config)) return true;
  return isProviderAlive(config, fetchImpl);
}

/**
 * One-token generation. This is the liveness half of the probe above: it is
 * what a wedged local server fails.
 */
export async function isProviderAlive(
  config: AiProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: aiRequestHeaders(config),
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1,
        stream: false,
        messages: [{ role: 'user', content: 'ok' }],
      }),
      signal: AbortSignal.timeout(LIVENESS_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `isProviderReachable` with a per-base-URL TTL memo. Call this from request
 * paths; call the raw probe only when a caller genuinely needs a fresh answer.
 * Single-flight: callers arriving while a probe for the same URL is running
 * await that probe instead of starting their own.
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
  if (hit !== undefined) {
    // A failure expires FASTER than a success: the recovery case is a tunnel
    // that just came back (`mlx-tunnel.service` restarts in 5s), and a 60s
    // negative memo told the operator "no AI provider is reachable" for a
    // minute after the brain was already answering.
    const ttl = hit.ok ? ttlMs : Math.min(ttlMs, REACHABILITY_FAILURE_TTL_MS);
    if (at - hit.at < ttl) return hit.ok;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const probe = isProviderReachable(config, deps.fetchImpl ?? fetch)
    .then((ok) => {
      cache.set(key, { ok, at: now() });
      return ok;
    })
    .finally(() => {
      if (inflight.get(key) === probe) inflight.delete(key);
    });
  inflight.set(key, probe);
  return probe;
}

/** Test seam: drop every memoized answer. */
export function resetProviderReachabilityCache(): void {
  cache.clear();
  inflight.clear();
}
