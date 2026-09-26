import type { PersistedClient } from '@tanstack/react-query-persist-client';

/** The rules for the repair workbench's refresh-surviving cache (operator 2026-09-24, pass 4 row 7). */

const WORKBENCH_CACHE_PREFIX = 'cf-rq-wb:';
/** Bump when a workbench facet's data shape changes, so old tabs don't paint it. */
export const WORKBENCH_CACHE_BUSTER = 'wb-v1';
export const WORKBENCH_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const WORKBENCH_QUERY_KEY = ['repairs', 'workbench'] as const;

interface WorkbenchCacheOwner {
  organizationId: string;
  staffId: number;
}

/** A persisted client plus the storage key (= identity) it was written for. */
interface StoredWorkbenchCache extends PersistedClient {
  owner: string;
}

export function workbenchCacheKey(owner: WorkbenchCacheOwner): string {
  return `${WORKBENCH_CACHE_PREFIX}${owner.organizationId}:${owner.staffId}`;
}

export function isWorkbenchQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === WORKBENCH_QUERY_KEY[0] && queryKey[1] === WORKBENCH_QUERY_KEY[1];
}

/** The string written under `ownerKey`; the owner travels inside the entry too. */
export function serializeWorkbenchCache(client: PersistedClient, ownerKey: string): string {
  const stored: StoredWorkbenchCache = { ...client, owner: ownerKey };
  return JSON.stringify(stored);
}

/** The persisted client stored under `ownerKey`, or null when it must not be restored: */
export function readWorkbenchCache(raw: string | null, ownerKey: string, now: number): PersistedClient | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const entry = parsed as Partial<StoredWorkbenchCache>;
  if (entry.owner !== ownerKey) return null;
  if (entry.buster !== WORKBENCH_CACHE_BUSTER) return null;
  if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) return null;
  if (now - entry.timestamp > WORKBENCH_CACHE_MAX_AGE_MS) return null;
  const queries = entry.clientState?.queries;
  if (!Array.isArray(queries)) return null;
  return {
    timestamp: entry.timestamp,
    buster: entry.buster,
    clientState: {
      mutations: [],
      queries: queries.filter((q) => Array.isArray(q?.queryKey) && isWorkbenchQueryKey(q.queryKey)),
    },
  };
}

/**
 * Remove every workbench entry in this tab except `keep` (the current
 * identity's). Sign-out passes nothing and clears them all. Storage that is
 * unavailable (privacy mode, SSR) is a no-op, never a throw.
 */
export function clearWorkbenchCache(keep?: string): void {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(WORKBENCH_CACHE_PREFIX) && key !== keep) doomed.push(key);
    }
    for (const key of doomed) storage.removeItem(key);
  } catch {
    // storage unavailable — nothing was written either
  }
}
