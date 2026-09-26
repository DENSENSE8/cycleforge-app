import type { QueryClient } from '@tanstack/react-query';

/** Cache surgery for optimistic writes. */

export type OptimisticCache<TVars, TCached = unknown> = {
  queryKey: readonly unknown[];
  /** `prefix` = every query under `queryKey`. Default is a single exact key. */
  match?: 'exact' | 'prefix';
  update: (current: TCached | undefined, vars: TVars) => TCached | undefined;
};

export type CacheSnapshot = {
  queryKey: readonly unknown[];
  previous: unknown;
};

function cacheEntries(
  client: QueryClient,
  cache: OptimisticCache<unknown>,
): ReadonlyArray<readonly [readonly unknown[], unknown]> {
  if (cache.match === 'prefix') {
    return client.getQueriesData({ queryKey: cache.queryKey });
  }
  return [[cache.queryKey, client.getQueryData(cache.queryKey)]];
}

export function snapshotAndPatch<TVars>(
  client: QueryClient,
  caches: readonly OptimisticCache<TVars>[],
  vars: TVars,
): CacheSnapshot[] {
  const snaps: CacheSnapshot[] = [];
  for (const cache of caches) {
    for (const [queryKey, previous] of cacheEntries(client, cache as OptimisticCache<unknown>)) {
      snaps.push({ queryKey, previous });
      client.setQueryData(queryKey, cache.update(previous as never, vars));
    }
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
