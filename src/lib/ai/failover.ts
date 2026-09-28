/** Run one OpenAI-wire call against a tenant's provider chain, demoting and falling forward when a provider cannot serve it. */

import type { AiCapability } from '@/lib/ai/provider';
import { aiRequestHeaders, isSelfHostedAiRuntime } from '@/lib/ai/provider';
import { resolveOrgAiChain, type OrgAiConfig, type OrgAiDeps } from '@/lib/ai/org-provider';
import {
  markProviderHealthy,
  markProviderUnhealthy,
  providerTimeoutMs,
} from '@/lib/ai/provider-health';
import { estimateTokensFromBytes, scanResponseUsage } from '@/lib/ai/response-usage';
import { recordAiUsage, type AiUsageContext, type RecordAiUsage } from '@/lib/ai/usage';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Statuses that mean "this PROVIDER cannot serve the call", as opposed to "this REQUEST is wrong".
 * 402 is an exhausted balance / paid-model gate and 429 a quota — both are the provider's state, not the request's.
 */
export function isProviderFault(status: number): boolean {
  return status >= 500 || status === 401 || status === 402 || status === 403 || status === 429;
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
  /** Usage-row context. Default: `assistant_aux` (chat) / `query_embed` (embed). */
  context?: AiUsageContext;
  /** Attribution for the usage row. */
  staffId?: number | null;
  sessionId?: string | null;
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
 * A failed attempt the model may still have billed for: our timeout fired while
 * it was generating, or a gateway gave up waiting on the upstream model (502/504).
 * Rejections (401/402/403/429) and connection failures never reached a model.
 */
function attemptMayHaveSpent(outcome: unknown): boolean {
  if (typeof outcome === 'number') return outcome === 502 || outcome === 504;
  const name = outcome instanceof Error ? outcome.name : '';
  return name === 'TimeoutError' || name === 'AbortError';
}

interface MeteredAttempt {
  orgId: OrgId;
  capability: AiCapability;
  request: AiFailoverRequest;
  config: OrgAiConfig;
  requestBytes: number;
  startedAt: number;
}

/**
 * One usage row per call that spent. Fire-and-forget: the served body is read
 * from a clone in the background, and nothing here throws into or delays the
 * caller. `res` is null for a failed attempt (input-only estimate).
 */
function meterAttempt(record: RecordAiUsage, attempt: MeteredAttempt, res: Response | null): void {
  const { orgId, capability, request, config } = attempt;
  const estimatedInput = estimateTokensFromBytes(attempt.requestBytes);
  const write = (tokens: {
    inputTokens: number;
    outputTokens: number;
    estimated: boolean;
    model: string | null;
  }) => {
    try {
      record({
        orgId,
        capability,
        source: config.source,
        model: config.model || tokens.model || 'unknown',
        context: request.context ?? (capability === 'embed' ? 'query_embed' : 'assistant_aux'),
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        estimated: tokens.estimated,
        // A self-hosted model costs the operator nothing per token.
        ...(isSelfHostedAiRuntime(config) ? { costMicrocents: 0 } : {}),
        staffId: request.staffId ?? null,
        sessionId: request.sessionId ?? null,
        latencyMs: Date.now() - attempt.startedAt,
        gatewayLogId: res?.headers.get('cf-aig-log-id') ?? null,
      });
    } catch (err) {
      console.warn('[ai-failover] usage metering failed (non-fatal):', err instanceof Error ? err.message : err);
    }
  };
  const inputOnly = { inputTokens: estimatedInput, outputTokens: 0, estimated: true, model: null };

  let copy: Response | null = null;
  try {
    copy = res?.clone() ?? null;
  } catch {
    // Body already disturbed — nothing left to read; the request still spent.
  }
  if (!copy) {
    write(inputOnly);
    return;
  }
  void scanResponseUsage(copy)
    .then((scan) =>
      write(
        scan.usage
          ? { ...scan.usage, estimated: false, model: scan.model }
          : {
              inputTokens: estimatedInput,
              outputTokens: capability === 'embed' ? 0 : scan.estimatedOutputTokens,
              estimated: true,
              model: scan.model,
            },
      ),
    )
    .catch(() => write(inputOnly));
}

/**
 * POST to the first provider in this org's chain that can serve the call.
 * Every call that spent is metered to `ai_usage_events`: the served answer, and
 * failed attempts the model may have billed for (`attemptMayHaveSpent`).
 */
export async function postToAiProvider(
  orgId: OrgId,
  capability: AiCapability,
  request: AiFailoverRequest,
  deps?: OrgAiDeps,
  /** Injected in tests so the retry/demote policy is exercised without network. */
  fetchImpl: typeof fetch = fetch,
  /** Injected in tests so metering is observed without a database. */
  record: RecordAiUsage = recordAiUsage,
): Promise<AiFailoverResult> {
  const chain = await resolveOrgAiChain(orgId, capability, deps);
  if (chain.length === 0) {
    throw new AiFailoverError('No AI provider is connected for this organization', []);
  }

  const attempts: { source: string; reason: string }[] = [];
  const demoted: OrgAiConfig[] = [];

  for (const config of chain) {
    const budget = request.timeoutMs ?? providerTimeoutMs(config.source);
    const body = JSON.stringify(request.buildBody ? request.buildBody(config) : request.body);
    const attempt: MeteredAttempt = {
      orgId,
      capability,
      request,
      config,
      requestBytes: Buffer.byteLength(body, 'utf8'),
      startedAt: Date.now(),
    };
    try {
      const res = await fetchImpl(`${config.baseURL.replace(/\/+$/, '')}${request.path}`, {
        method: 'POST',
        headers: aiRequestHeaders(config, request.headers),
        body,
        signal: AbortSignal.timeout(budget),
      });

      if (!isProviderFault(res.status)) {
        markProviderHealthy(orgId, config.source, capability);
        // A 4xx the request caused is rejected before generation — nothing spent.
        if (res.ok) meterAttempt(record, attempt, res);
        return { res, served: config, demoted };
      }

      if (attemptMayHaveSpent(res.status)) meterAttempt(record, attempt, null);
      markProviderUnhealthy(orgId, config.source, capability);
      demoted.push(config);
      attempts.push({ source: config.source, reason: `HTTP ${res.status}` });
    } catch (err) {
      // Timeout or network error — indistinguishable from the caller's side and
      // treated identically: this provider did not answer.
      if (attemptMayHaveSpent(err)) meterAttempt(record, attempt, null);
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
