/** Optimistic URL-param paint — mount-gated opens paint before App Router soft-replace catches up. */

/** Pending wins when a write is in flight (`undefined` = follow the URL). */
export function resolveOptimisticParam<T>(url: T, pending: T | undefined): T {
  return pending !== undefined ? pending : url;
}

/**
 * Clear pending only when the URL matches the written value.
 * Intermediate hops (e.g. index → leaf) must not drop a newer pending write.
 */
export function shouldClearOptimisticParam<T>(
  url: T,
  pending: T | undefined,
  eq: (a: T, b: T) => boolean = Object.is,
): boolean {
  return pending !== undefined && eq(url, pending);
}

/**
 * Compound record pending: each key present in `pending` overlays `url`.
 * Missing pending keys follow the URL (partial paint / mutual-exclusion patches).
 */
export function resolveOptimisticParams<T extends Record<string, unknown>>(
  url: T,
  pending: Partial<T> | undefined,
): T {
  if (pending === undefined) return url;
  return { ...url, ...pending };
}

/**
 * Clear compound pending only when every key present in `pending` matches `url`.
 * Keys absent from `pending` are ignored (a task-only patch must not wait on watch).
 */
export function shouldClearOptimisticParams<T extends Record<string, unknown>>(
  url: T,
  pending: Partial<T> | undefined,
  keyEquals: <K extends keyof T>(a: T[K], b: T[K], key: K) => boolean = (a, b) =>
    Object.is(a, b),
): boolean {
  if (pending === undefined) return false;
  const keys = Object.keys(pending) as (keyof T)[];
  if (keys.length === 0) return false;
  return keys.every((key) =>
    keyEquals(url[key], pending[key] as T[typeof key], key),
  );
}

/**
 * Seed param edits from the live address bar. React `searchParams` can lag a
 * concurrent soft-replace — a stale seed drops keys or clobbers a just-written
 * open param so the click looks dead.
 */
export function readLiveSearchParams(fallbackQs: string): URLSearchParams {
  const seed =
    typeof window !== 'undefined' ? window.location.search : fallbackQs;
  return new URLSearchParams(
    seed.startsWith('?') ? seed.slice(1) : seed,
  );
}
