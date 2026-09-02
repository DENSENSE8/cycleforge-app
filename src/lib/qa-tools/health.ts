export const QA_HEALTH_PROVIDERS = {
  amazon: '/api/amazon/health',
  ebay: '/api/ebay/health',
  zoho: '/api/zoho/health',
  google_drive: '/api/integrations/google-drive/health',
  nextiva: '/api/integrations/nextiva/health',
} as const;

export type QaHealthProvider = keyof typeof QA_HEALTH_PROVIDERS;

export interface QaHealthSummary {
  provider: QaHealthProvider;
  ok: boolean;
  connected?: boolean;
  httpStatus: number;
  durationMs: number;
}

export function summarizeQaHealthResponse(
  provider: QaHealthProvider,
  httpStatus: number,
  body: unknown,
  durationMs: number,
): QaHealthSummary {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const connected = typeof record.connected === 'boolean' ? record.connected : undefined;
  const tokenOk = typeof record.token_ok === 'boolean' ? record.token_ok : true;
  const providerOk = typeof record.ok === 'boolean'
    ? record.ok
    : typeof record.success === 'boolean'
      ? record.success
      : httpStatus >= 200 && httpStatus < 300;

  return {
    provider,
    ok: providerOk && connected !== false && tokenOk,
    ...(connected === undefined ? {} : { connected }),
    httpStatus,
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}

export async function checkQaProviderHealth(
  request: Request,
  provider: QaHealthProvider,
): Promise<QaHealthSummary> {
  const startedAt = performance.now();
  const response = await fetch(new URL(QA_HEALTH_PROVIDERS[provider], request.url), {
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null);
  return summarizeQaHealthResponse(provider, response.status, body, performance.now() - startedAt);
}
