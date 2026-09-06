/** Shared health-check response parsing for integration cards + detail pages. */

export interface HealthAccountResult {
  ok?: boolean;
  error?: string;
  accountName?: string;
}

export interface HealthResponse {
  ok?: boolean;
  success?: boolean;
  error?: string;
  accounts?: HealthAccountResult[];
}

export function parseHealthResult(data: HealthResponse, providerLabel: string): { ok: boolean; message: string } {
  const healthy = Boolean(data.ok ?? data.success);
  if (healthy) {
    return { ok: true, message: `${providerLabel} connection healthy.` };
  }

  if (data.error) {
    return { ok: false, message: `${providerLabel}: ${data.error}` };
  }

  const failedAccount = data.accounts?.find((a) => a.ok === false);
  if (failedAccount?.error) {
    const name = failedAccount.accountName ? ` (${failedAccount.accountName})` : '';
    return { ok: false, message: `${providerLabel}${name}: ${failedAccount.error}` };
  }

  return { ok: false, message: `${providerLabel}: health check failed` };
}
