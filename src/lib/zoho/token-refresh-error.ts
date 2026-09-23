/**
 * Pure helpers for Zoho OAuth refresh failures.
 *
 * Keeps message shapes classifier-compatible with
 * `isCredentialAuthFailure` (`token refresh`, `invalid_code`, …) while
 * surfacing Zoho's `error` / `error_description` into `last_error`.
 */

const DESC_MAX = 200;

interface ZohoTokenErrorFields {
  error?: string | null;
  errorDescription?: string | null;
}

/** Pull `error` / `error_description` from a Zoho token endpoint body (JSON or plain). */
export function parseZohoTokenErrorBody(body: string): ZohoTokenErrorFields {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return {};
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const error = data.error != null ? String(data.error).trim() : '';
    const errorDescription =
      data.error_description != null
        ? String(data.error_description).trim()
        : data.errorDescription != null
          ? String(data.errorDescription).trim()
          : '';
    return {
      ...(error ? { error } : {}),
      ...(errorDescription ? { errorDescription } : {}),
    };
  } catch {
    // Non-JSON (HTML / plain) — keep a short slice as description only.
    return { errorDescription: trimmed.slice(0, DESC_MAX) };
  }
}

/**
 * Build a throw message for a failed refresh HTTP response.
 * Always includes "token refresh" so auth-failure classification stays true.
 */
export function formatZohoTokenRefreshHttpError(status: number, body: string): string {
  const { error, errorDescription } = parseZohoTokenErrorBody(body);
  let msg = `Zoho token refresh failed: ${status}`;
  if (error) msg += ` (${error})`;
  if (errorDescription) msg += `: ${errorDescription.slice(0, DESC_MAX)}`;
  return msg;
}

/** Build a throw message when HTTP is OK but the JSON body carries `error`. */
export function formatZohoTokenRefreshBodyError(data: Record<string, unknown>): string {
  const error = data.error != null ? String(data.error).trim() : 'unknown';
  const errorDescription =
    data.error_description != null
      ? String(data.error_description).trim()
      : data.errorDescription != null
        ? String(data.errorDescription).trim()
        : '';
  if (errorDescription) {
    return `Zoho token refresh error: ${error}: ${errorDescription.slice(0, DESC_MAX)}`;
  }
  return `Zoho token refresh error: ${error}`;
}
