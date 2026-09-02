/**
 * Redact credential-bearing fields from objects before they are stored on a
 * QA test-run ledger or returned to the console.
 *
 * Never store: access/refresh tokens, Authorization headers, client secrets,
 * full credential payloads, database URLs.
 */

const SECRET_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$|token|secret|password|passwd|credential|api[_-]?key|client[_-]?secret|refresh|access[_-]?token|database[_-]?url|connection[_-]?string/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 4000) return `${value.slice(0, 4000)}…`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(k)) {
      out[k] = v == null || v === '' ? v : '[redacted]';
    } else {
      out[k] = redactValue(v, depth + 1);
    }
  }
  return out;
}

export function redactRecord(value: unknown): Record<string, unknown> {
  const redacted = redactValue(value);
  if (redacted && typeof redacted === 'object' && !Array.isArray(redacted)) {
    return redacted as Record<string, unknown>;
  }
  return { value: redacted };
}
