/** Redis cache kill-switch + per-namespace gating (Phase 0.5). */
function readBoolEnv(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/** Global kill-switch. Default ON (caching enabled) unless explicitly disabled. */
export function isRedisCacheEnabled(): boolean {
  return !readBoolEnv('REDIS_CACHE_DISABLED', false);
}

let nsAllowlist: Set<string> | null | undefined;
function parseNsAllowlist(): Set<string> | null {
  if (nsAllowlist !== undefined) return nsAllowlist;
  const raw = (process.env.REDIS_CACHE_NS || '').trim();
  nsAllowlist = raw ? new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  return nsAllowlist;
}

/** True when `namespace` is eligible for caching (kill-switch off + allowlist match). */
export function isNamespaceCacheEnabled(namespace: string): boolean {
  if (!isRedisCacheEnabled()) return false;
  const allow = parseNsAllowlist();
  if (allow === null) return true; // no allowlist → all namespaces eligible
  return allow.has(namespace);
}

/** Test-only: reset the memoized allowlist after mutating process.env. */
export function __resetCacheFlagsForTest(): void {
  nsAllowlist = undefined;
}
