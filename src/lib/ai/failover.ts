/**
 * Run one OpenAI-wire call against a tenant's provider chain, demoting and
 * falling forward when a provider cannot serve it.
 *
 * This is the half of "local-first" that makes the inversion safe. Preferring a
 * tenant's own box is only an improvement if a box that is down, cold, or
 * behind an expired Cloudflare Access token does not take the feature down with
 * it. `resolveOrgAiChain` decides the order; this decides what happens when the
 * head of that chain does not answer.
 *
 * Callers get the raw `Response` back, so a streaming route can stream it and a
 * JSON route can parse it — the failover happens BEFORE the first byte is
 * handed over, never mid-stream (see `Why not mid-stream` below).
 */

import type { AiCapability } from '@/lib/ai/provider';
import { aiRequestHeaders } from '@/lib/ai/provider';
import { resolveOrgAiChain, type OrgAiConfig, type OrgAiDeps } from '@/lib/ai/org-provider';
import {
  markProviderHealthy,
  markProviderUnhealthy,
  providerTimeoutMs,
} from '@/lib/ai/provider-health';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Statuses that mean "this PROVIDER cannot serve the call", as opposed to
 * "this REQUEST is wrong".
 *
 *  - 5xx        — the provider is broken
 *  - 401 / 403  — its credential is wrong or its edge (Cloudflare Access)
 *                 rejected us; the next provider has a different credential
 *  - 429        — it is rate-limiting us; another provider is not
 *
 * A 400 / 404 / 422 is deliberately NOT here. Those mean the body we sent is
 * unacceptable, and replaying it against three more providers just spends three
 * more times as much to get the same answer — while looking, in the logs, like
 * an outage rather than a bug.
 */
function isProviderFault(status: number): boolean {
  return status >= 500 || status === 401 || status === 403 || status === 429;
}

interface AiFailoverRequest {
  /** Path under the provider's baseURL, e.g. `/chat/completions`. */
  path: string;
  /** Static body. Ignored when `buildBody` is supplied. */
  body: unknown;
  /**
   * Per-attempt body builder.
   *
   * Required whenever the body names the model, because falling forward to a
   * different provider is also falling forward to a **different model name** —
   * replaying `{"model":"qwen3.8-27b"}` against OpenAI is a guaranteed 404 that
   * would look like the fallback provider being broken.
   */
  buildBody?: (config: OrgAiConfig) => unknown;
  /** Per-call routing/telemetry headers (session id, X-Source …). */
  headers?: Record<string, string>;
  /**
   * Overall budget. Defaults to a per-provider value that is generous for a
   * self-hosted model (cold MLX load is ~14s) and short for cloud.
   *
   * **Streaming callers must override this.** `AbortSignal.timeout` bounds the
   * entire fetch including the response body, so the default would cut a long
   * streamed answer off mid-sentence rather than bounding the connect.
   */
  timeoutMs?: number;
}

interface AiFailoverResult {
  res: Response;
  /** The provider that actually answered — report THIS, never the preference. */
  served: OrgAiConfig;
  /** Providers that failed before it, in the order they were tried. */
  demoted: OrgAiConfig[];
}

export class AiFailoverError extends Error {
  constructor(
    message: string,
    readonly attempts: { source: string; reason: string }[],
  ) {
    super(message);
    this.name = 'AiFailoverError';
  }
}

/**
 * POST to the first provider in this org's chain that can serve the call.
 *
 * Returns the first non-provider-fault response — including a 400, which is
 * returned rather than retried (see {@link isProviderFault}).
 *
 * Throws `AiFailoverError` only when EVERY provider faulted, with one line per
 * attempt so the log says which providers were tried and why each was dropped.
 */
export async function postToAiProvider(
  orgId: OrgId,
  capability: AiCapability,
  request: AiFailoverRequest,
  deps?: OrgAiDeps,
  /** Injected in tests so the retry/demote policy is exercised without network. */
  fetchImpl: typeof fetch = fetch,
): Promise<AiFailoverResult> {
  const chain = await resolveOrgAiChain(orgId, capability, deps);
  if (chain.length === 0) {
    throw new AiFailoverError('No AI provider is connected for this organization', []);
  }

  const attempts: { source: string; reason: string }[] = [];
  const demoted: OrgAiConfig[] = [];

  for (const config of chain) {
    const budget = request.timeoutMs ?? providerTimeoutMs(config.source);
    try {
      const res = await fetchImpl(`${config.baseURL.replace(/\/+$/, '')}${request.path}`, {
        method: 'POST',
        headers: aiRequestHeaders(config, request.headers),
        body: JSON.stringify(request.buildBody ? request.buildBody(config) : request.body),
        signal: AbortSignal.timeout(budget),
      });

      if (!isProviderFault(res.status)) {
        markProviderHealthy(orgId, config.source, capability);
        return { res, served: config, demoted };
      }

      markProviderUnhealthy(orgId, config.source, capability);
      demoted.push(config);
      attempts.push({ source: config.source, reason: `HTTP ${res.status}` });
    } catch (err) {
      // Timeout or network error — indistinguishable from the caller's side and
      // treated identically: this provider did not answer.
      markProviderUnhealthy(orgId, config.source, capability);
      demoted.push(config);
      attempts.push({
        source: config.source,
        reason: err instanceof Error ? err.name : 'network error',
      });
    }
  }

  throw new AiFailoverError(
    `Every AI provider failed (${attempts.map((a) => `${a.source}: ${a.reason}`).join(', ')})`,
    attempts,
  );
}

/**
 * Why not mid-stream
 * ------------------
 * Failover stops once a provider returns headers. A streaming answer that dies
 * after 200 tokens cannot be transparently retried elsewhere: the user has
 * already SEEN those tokens, and a second provider would restart from nothing,
 * producing a visibly duplicated or contradictory answer. Surfacing the break
 * is honest; silently splicing two models' output is not.
 */
