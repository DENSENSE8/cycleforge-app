/** Run one OpenAI-wire call against a tenant's provider chain, demoting and falling forward when a provider cannot serve it. */

import type { AiCapability } from '@/lib/ai/provider';
import { aiRequestHeaders } from '@/lib/ai/provider';
import { resolveOrgAiChain, type OrgAiConfig, type OrgAiDeps } from '@/lib/ai/org-provider';
import {
  markProviderHealthy,
  markProviderUnhealthy,
  providerTimeoutMs,
} from '@/lib/ai/provider-health';
import type { OrgId } from '@/lib/tenancy/constants';

/** Statuses that mean "this PROVIDER cannot serve the call", as opposed to "this REQUEST is wrong". */
function isProviderFault(status: number): boolean {
  return status >= 500 || status === 401 || status === 403 || status === 429;
}

interface AiFailoverRequest {
  /** Path under the provider's baseURL, e.g. `/chat/completions`. */
  path: string;
  /** Static body. Ignored when `buildBody` is supplied. */
  body: unknown;
  /** Per-attempt body builder. */
  buildBody?: (config: OrgAiConfig) => unknown;
  /** Per-call routing/telemetry headers (session id, X-Source …). */
  headers?: Record<string, string>;
  /** Overall budget. */
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

/** POST to the first provider in this org's chain that can serve the call. */
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

/** Why not mid-stream ------------------ Failover stops once a provider returns headers. */
