/**
 * Zendesk HTTP client — rate-limited, retried, deduped upstream calls.
 *
 * All Zendesk REST traffic should flow through {@link zendeskHttpRequest} so
 * every surface (support console, warranty, receiving claims, overview) shares
 * one per-org queue, distributed budget (Upstash Redis when configured),
 * in-flight GET dedup, proactive header pacing, 429 Retry-After backoff, and a
 * circuit breaker.
 *
 * Mirrors the Zoho client shape in src/lib/zoho/httpClient.ts.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { isRedisConfigured, redisCmd } from '@/lib/redis/client';

export const ZENDESK_HTTP_CONFIG = {
  /** In-process token bucket per org (per minute). */
  reservoir: 120,
  reservoirRefillAmount: 120,
  reservoirRefillIntervalMs: 60_000,
  maxConcurrent: 4,
  minTimeMs: 400,
  maxRetries: 4,
  /** Org-wide distributed ceiling (Redis sliding window, 60s). */
  distributedLimit: 100,
  distributedWindowMs: 60_000,
  circuitFailureThreshold: 5,
  circuitFailureWindowMs: 30_000,
  circuitOpenMs: 60_000,
  requestTimeoutMs: 15_000,
  /** Slow down when Zendesk reports low remaining quota. */
  lowRemainingThreshold: 25,
  lowRemainingDelayMs: 2_000,
} as const;

const REDIS_CIRCUIT_PREFIX = 'zendesk:circuit:v1:';

export interface ZendeskHttpAuth {
  subdomain: string;
  user: string;
  apiToken: string;
}

export type ZendeskHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ZendeskHttpRequestInit {
  body?: unknown;
  headers?: Record<string, string>;
  /** Raw bytes for uploads — bypasses JSON serialization. */
  rawBody?: Uint8Array;
  contentType?: string;
}

/** Thrown for non-2xx Zendesk API responses. `status` mirrors the HTTP status. */
export class ZendeskApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ZendeskApiError';
  }
}

export class ZendeskRateLimitError extends ZendeskApiError {
  constructor(status: number, message: string, public readonly retryAfterMs: number | null) {
    super(status, message);
    this.name = 'ZendeskRateLimitError';
  }
}

export class ZendeskCircuitOpenError extends ZendeskApiError {
  constructor(public readonly retryAfterMs: number) {
    super(429, `Zendesk circuit open for another ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'ZendeskCircuitOpenError';
  }
}

type RequestTask<T = unknown> = {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type HeaderState = { remaining: number; at: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfter(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  const when = Date.parse(retryAfter);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

export function zendeskOrgKey(orgId?: OrgId): string {
  return orgId ?? '__env__';
}

function buildUrl(config: ZendeskHttpAuth, path: string): string {
  const base = `https://${config.subdomain}.zendesk.com`;
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function readRateLimitRemaining(response: Response): number | null {
  const raw =
    response.headers.get('x-rate-limit-remaining') ??
    response.headers.get('X-Rate-Limit-Remaining') ??
    response.headers.get('ratelimit-remaining');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

class ZendeskRateLimiter {
  private queue: Array<RequestTask<any>> = [];
  private activeCount = 0;
  private reservoir = ZENDESK_HTTP_CONFIG.reservoir;
  private nextAllowedAt = 0;
  private lastRefillAt = Date.now();
  private timer: NodeJS.Timeout | null = null;

  schedule<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ run, resolve, reject });
      this.drain();
    });
  }

  getStatus() {
    this.refill();
    return {
      queueSize: this.queue.length,
      activeCount: this.activeCount,
      reservoir: this.reservoir,
      nextAllowedAt: this.nextAllowedAt,
    };
  }

  private refill() {
    const now = Date.now();
    if (now - this.lastRefillAt >= ZENDESK_HTTP_CONFIG.reservoirRefillIntervalMs) {
      this.reservoir = ZENDESK_HTTP_CONFIG.reservoirRefillAmount;
      this.lastRefillAt = now;
    }
  }

  private scheduleDrain(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, Math.max(1, delayMs));
  }

  private drain() {
    this.refill();
    const now = Date.now();

    if (this.activeCount >= ZENDESK_HTTP_CONFIG.maxConcurrent || this.queue.length === 0) {
      return;
    }

    if (this.reservoir <= 0) {
      this.scheduleDrain(Math.max(1, this.lastRefillAt + ZENDESK_HTTP_CONFIG.reservoirRefillIntervalMs - now));
      return;
    }

    if (now < this.nextAllowedAt) {
      this.scheduleDrain(this.nextAllowedAt - now);
      return;
    }

    const task = this.queue.shift() as RequestTask<unknown>;
    this.activeCount += 1;
    this.reservoir -= 1;
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + ZENDESK_HTTP_CONFIG.minTimeMs;

    void task
      .run()
      .then(task.resolve, task.reject)
      .finally(() => {
        this.activeCount -= 1;
        this.drain();
      });

    if (this.queue.length > 0) this.drain();
  }
}

class ZendeskCircuitBreaker {
  private consecutiveFailures = 0;
  private firstFailureAt = 0;
  private openUntil = 0;

  assertClosed() {
    const retryAfterMs = this.getRetryAfterMs();
    if (retryAfterMs > 0) throw new ZendeskCircuitOpenError(retryAfterMs);
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.firstFailureAt = 0;
  }

  recordRateLimitFailure() {
    const now = Date.now();
    if (!this.firstFailureAt || now - this.firstFailureAt > ZENDESK_HTTP_CONFIG.circuitFailureWindowMs) {
      this.firstFailureAt = now;
      this.consecutiveFailures = 1;
    } else {
      this.consecutiveFailures += 1;
    }

    if (this.consecutiveFailures >= ZENDESK_HTTP_CONFIG.circuitFailureThreshold) {
      this.openUntil = now + ZENDESK_HTTP_CONFIG.circuitOpenMs;
    }
  }

  getRetryAfterMs() {
    return Math.max(0, this.openUntil - Date.now());
  }

  forceOpen(ms: number) {
    this.openUntil = Date.now() + ms;
  }

  getStatus() {
    return {
      isOpen: this.getRetryAfterMs() > 0,
      retryAfterMs: this.getRetryAfterMs(),
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

const limiters = new Map<string, ZendeskRateLimiter>();
const circuits = new Map<string, ZendeskCircuitBreaker>();
const headerState = new Map<string, HeaderState>();
const inFlight = new Map<string, Promise<unknown>>();

function getLimiter(orgKey: string): ZendeskRateLimiter {
  let limiter = limiters.get(orgKey);
  if (!limiter) {
    limiter = new ZendeskRateLimiter();
    limiters.set(orgKey, limiter);
  }
  return limiter;
}

function getCircuit(orgKey: string): ZendeskCircuitBreaker {
  let circuit = circuits.get(orgKey);
  if (!circuit) {
    circuit = new ZendeskCircuitBreaker();
    circuits.set(orgKey, circuit);
  }
  return circuit;
}

async function readDistributedCircuitOpenMs(orgKey: string): Promise<number> {
  if (!isRedisConfigured()) return 0;
  try {
    const raw = await redisCmd<string>(['GET', `${REDIS_CIRCUIT_PREFIX}${orgKey}`]);
    const openUntil = Number(raw);
    if (!Number.isFinite(openUntil)) return 0;
    return Math.max(0, openUntil - Date.now());
  } catch {
    return 0;
  }
}

async function writeDistributedCircuitOpen(orgKey: string, ms: number): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const openUntil = Date.now() + ms;
    await redisCmd(['SET', `${REDIS_CIRCUIT_PREFIX}${orgKey}`, String(openUntil), 'PX', String(ms)]);
  } catch {
    // fail open — in-process circuit still protects this instance
  }
}

async function assertCircuitClosed(orgKey: string): Promise<void> {
  const circuit = getCircuit(orgKey);
  circuit.assertClosed();
  const distributedMs = await readDistributedCircuitOpenMs(orgKey);
  if (distributedMs > 0) throw new ZendeskCircuitOpenError(distributedMs);
}

async function awaitDistributedBudget(orgKey: string): Promise<void> {
  const result = await checkRateLimitAsync({
    headers: new Headers({ 'x-real-ip': 'zendesk-http' }),
    routeKey: 'zendesk:upstream',
    scope: orgKey,
    limit: ZENDESK_HTTP_CONFIG.distributedLimit,
    windowMs: ZENDESK_HTTP_CONFIG.distributedWindowMs,
  });
  if (!result.ok) {
    await sleep((result.retryAfterSec ?? 5) * 1000);
  }
}

function proactiveDelayMs(orgKey: string): number {
  const state = headerState.get(orgKey);
  if (!state) return 0;
  if (Date.now() - state.at > 120_000) return 0;
  if (state.remaining <= ZENDESK_HTTP_CONFIG.lowRemainingThreshold) {
    return ZENDESK_HTTP_CONFIG.lowRemainingDelayMs;
  }
  return 0;
}

function rememberRateHeaders(orgKey: string, response: Response): void {
  const remaining = readRateLimitRemaining(response);
  if (remaining == null) return;
  headerState.set(orgKey, { remaining, at: Date.now() });
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ZENDESK_HTTP_CONFIG.requestTimeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}

async function performZendeskRequest<T>(
  config: ZendeskHttpAuth,
  orgKey: string,
  method: ZendeskHttpMethod,
  path: string,
  init: ZendeskHttpRequestInit = {},
): Promise<T> {
  const retryableHttpStatuses = new Set([429, 500, 502, 503, 504]);
  const auth = Buffer.from(`${config.user}/token:${config.apiToken}`).toString('base64');
  const url = buildUrl(config, path);

  for (let attempt = 0; attempt <= ZENDESK_HTTP_CONFIG.maxRetries; attempt++) {
    const delay = proactiveDelayMs(orgKey);
    if (delay > 0) await sleep(delay);
    await awaitDistributedBudget(orgKey);

    let response: Response;
    try {
      const headers: Record<string, string> = {
        Authorization: `Basic ${auth}`,
        ...(init.headers ?? {}),
      };
      if (init.rawBody) {
        headers['Content-Type'] = init.contentType ?? 'application/octet-stream';
      } else if (init.body != null) {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      }

      response = await fetchWithTimeout(url, {
        method,
        headers,
        body:
          init.rawBody != null
            ? (init.rawBody as unknown as BodyInit)
            : init.body != null
              ? JSON.stringify(init.body)
              : undefined,
      });
    } catch (error: unknown) {
      if (attempt === ZENDESK_HTTP_CONFIG.maxRetries) throw error;
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    rememberRateHeaders(orgKey, response);

    if (!response.ok) {
      const errorText = await readErrorText(response);
      const message = `Zendesk request failed (${response.status})${errorText ? `: ${errorText}` : ''}`;

      if (response.status === 429) {
        const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
        const error = new ZendeskRateLimitError(response.status, message, retryAfterMs);
        getCircuit(orgKey).recordRateLimitFailure();
        if (getCircuit(orgKey).getRetryAfterMs() > 0) {
          await writeDistributedCircuitOpen(orgKey, ZENDESK_HTTP_CONFIG.circuitOpenMs);
        }
        if (attempt < ZENDESK_HTTP_CONFIG.maxRetries) {
          await sleep(retryAfterMs ?? 1000 * 2 ** attempt);
          continue;
        }
        throw error;
      }

      const error = new ZendeskApiError(response.status, message);
      if (retryableHttpStatuses.has(response.status) && attempt < ZENDESK_HTTP_CONFIG.maxRetries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw error;
    }

    if (response.status === 204) return undefined as T;
    return response.json().catch(() => ({} as T));
  }

  throw new ZendeskApiError(500, 'Zendesk request exhausted retries');
}

async function scheduleRequest<T>(
  config: ZendeskHttpAuth,
  orgKey: string,
  method: ZendeskHttpMethod,
  path: string,
  init: ZendeskHttpRequestInit = {},
): Promise<T> {
  await assertCircuitClosed(orgKey);
  const limiter = getLimiter(orgKey);
  const circuit = getCircuit(orgKey);
  try {
    const result = await limiter.schedule(() =>
      performZendeskRequest<T>(config, orgKey, method, path, init),
    );
    circuit.recordSuccess();
    return result;
  } catch (error) {
    if (error instanceof ZendeskRateLimitError) {
      circuit.recordRateLimitFailure();
      if (circuit.getRetryAfterMs() > 0) {
        await writeDistributedCircuitOpen(orgKey, ZENDESK_HTTP_CONFIG.circuitOpenMs);
      }
    }
    throw error;
  }
}

/**
 * Rate-limited Zendesk REST call. Pass `orgId` (or omit for the legacy env path)
 * so the queue + circuit are scoped per tenant.
 */
export async function zendeskHttpRequest<T = unknown>(
  config: ZendeskHttpAuth,
  method: ZendeskHttpMethod,
  path: string,
  init: ZendeskHttpRequestInit = {},
  orgId?: OrgId,
): Promise<T> {
  const orgKey = zendeskOrgKey(orgId);
  const dedupeKey = method === 'GET' ? `${orgKey}:${method}:${path}` : null;

  if (dedupeKey) {
    const pending = inFlight.get(dedupeKey);
    if (pending) return pending as Promise<T>;
    const promise = scheduleRequest<T>(config, orgKey, method, path, init).finally(() => {
      inFlight.delete(dedupeKey);
    });
    inFlight.set(dedupeKey, promise);
    return promise;
  }

  return scheduleRequest<T>(config, orgKey, method, path, init);
}

export function getZendeskHttpClientStatus(orgId?: OrgId) {
  const orgKey = zendeskOrgKey(orgId);
  return {
    orgKey,
    config: ZENDESK_HTTP_CONFIG,
    limiter: getLimiter(orgKey).getStatus(),
    circuit: getCircuit(orgKey).getStatus(),
    headerState: headerState.get(orgKey) ?? null,
    inFlight: inFlight.size,
  };
}

/** Test-only reset — clears per-process queues, circuits, and dedup maps. */
export function resetZendeskHttpStateForTests(): void {
  limiters.clear();
  circuits.clear();
  headerState.clear();
  inFlight.clear();
}
