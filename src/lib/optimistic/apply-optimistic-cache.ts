import type { QueryClient } from '@tanstack/react-query';

/**
 * Cache surgery for optimistic writes. `useOptimisticMutation` is the call
 * site; these helpers are the part a test can drive without React.
 *
 * Snapshot → patch → (on failure) restore. Exact query keys, not prefixes —
 * prefix surgery lives in station-cache-patch and is a different job.
 */

export type OptimisticCache<TVars, TCached = unknown> = {
  queryKey: readonly unknown[];
  update: (current: TCached | undefined, vars: TVars) => TCached | undefined;
};

export type CacheSnapshot = {
  queryKey: readonly unknown[];
  previous: unknown;
};

export function snapshotAndPatch<TVars>(
  client: QueryClient,
  caches: readonly OptimisticCache<TVars>[],
  vars: TVars,
): CacheSnapshot[] {
  const snaps: CacheSnapshot[] = [];
  for (const cache of caches) {
    const previous = client.getQueryData(cache.queryKey);
    snaps.push({ queryKey: cache.queryKey, previous });
    client.setQueryData(cache.queryKey, cache.update(previous as never, vars));
  }
  return snaps;
}

export function restoreSnapshots(client: QueryClient, snaps: readonly CacheSnapshot[]): void {
  for (const snap of snaps) {
    client.setQueryData(snap.queryKey, snap.previous);
  }
}

export async function beginOptimisticUpdate<TVars>(
  client: QueryClient,
  caches: readonly OptimisticCache<TVars>[],
  vars: TVars,
): Promise<CacheSnapshot[]> {
  await Promise.all(caches.map((c) => client.cancelQueries({ queryKey: c.queryKey })));
  return snapshotAndPatch(client, caches, vars);
}

export function mutationErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return 'Update failed';
}
