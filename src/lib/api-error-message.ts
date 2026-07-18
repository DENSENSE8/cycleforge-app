/**
 * Prefer a human `message` from withAuth's `{ error: 'INTERNAL', message }`
 * payload over the bare `INTERNAL` code — operators should never see that code
 * in a toast.
 */
export function apiErrorMessage(
  body: { error?: string; message?: string } | null | undefined,
  status: number,
  fallback?: string,
): string {
  if (body?.message?.trim()) return body.message.trim();
  if (body?.error && body.error !== 'INTERNAL') return body.error;
  if (status === 429) {
    return 'Zoho rate limit reached — try again after the daily cap resets';
  }
  if (status >= 500 || body?.error === 'INTERNAL') {
    return fallback || 'Something went wrong — try again';
  }
  return fallback || `Request failed (${status})`;
}
