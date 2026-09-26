'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { hydrate, useQueryClient } from '@tanstack/react-query';
import {
  persistQueryClientSubscribe,
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { useAuth } from '@/contexts/AuthContext';
import {
  clearWorkbenchCache,
  isWorkbenchQueryKey,
  readWorkbenchCache,
  serializeWorkbenchCache,
  WORKBENCH_CACHE_BUSTER,
  WORKBENCH_CACHE_MAX_AGE_MS,
  WORKBENCH_QUERY_KEY,
  workbenchCacheKey,
} from '@/lib/mobile/workbench-cache';

/** Cache events arrive per fetch-state change; one write a second is plenty. */
const PERSIST_THROTTLE_MS = 1000;

/**
 * The stored workbench entry for `storageKey`, if it may be trusted. A
 * rejected entry (other identity, old buster, expired, corrupt) is removed so
 * it cannot linger in the tab.
 */
function restoreStored(storageKey: string): PersistedClient | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey);
    const client = readWorkbenchCache(raw, storageKey, Date.now());
    if (!client && raw !== null) sessionStorage.removeItem(storageKey);
    return client ?? undefined;
  } catch {
    return undefined;
  }
}

/** A `sessionStorage` persister for one identity. */
function createSessionPersister(storageKey: string, holding: () => boolean) {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    pending = null;
    clearTimeout(timer);
    timer = undefined;
  };

  const flush = () => {
    const client = pending;
    cancel();
    if (!client) return;
    try {
      // No workbench reads cached: no entry, rather than an empty one.
      if (client.clientState.queries.length === 0) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, serializeWorkbenchCache(client, storageKey));
    } catch {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // storage unavailable
      }
    }
  };

  const persister: Persister = {
    persistClient: (client) => {
      if (holding()) return;
      pending = client;
      timer ??= setTimeout(flush, PERSIST_THROTTLE_MS);
    },
    restoreClient: () => restoreStored(storageKey),
    removeClient: () => {
      cancel();
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // storage unavailable
      }
    },
  };

  return { persister, flush, cancel };
}

/** Lets the phone repair workbench (`/m/rs/[id]` and its sub-screens) survive a browser refresh: */
export function WorkbenchCachePersistence() {
  const queryClient = useQueryClient();
  const { user, isLoaded } = useAuth();
  const ownerKey = user ? workbenchCacheKey({ organizationId: user.organizationId, staffId: user.staffId }) : null;
  /** The identity whose cache this tab's QueryClient holds; null until one restores. */
  const restoredFor = useRef<string | null>(null);
  /** The stored entry read on the first client render, until it is put back. */
  const toRestore = useRef<PersistedClient | undefined>(undefined);

  if (ownerKey && restoredFor.current === null && typeof window !== 'undefined') {
    restoredFor.current = ownerKey;
    // Before any route query is built: restored entries must outlive the
    // global 5 min gcTime to be worth keeping.
    queryClient.setQueryDefaults(WORKBENCH_QUERY_KEY, { gcTime: WORKBENCH_CACHE_MAX_AGE_MS });
    toRestore.current = restoreStored(ownerKey);
  }

  // A layout effect so the listener is in place before any route query
  // subscribes (route effects run after this one in the same commit).
  useLayoutEffect(() => {
    if (!toRestore.current) return;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      const client = toRestore.current;
      if (event.type !== 'observerAdded' || !client || !isWorkbenchQueryKey(event.query.queryKey)) return;
      toRestore.current = undefined;
      unsubscribe();
      if (restoredFor.current === ownerKey) hydrate(queryClient, client.clientState);
    });
    return unsubscribe;
  }, [ownerKey, queryClient]);

  useEffect(() => {
    if (!ownerKey) {
      if (isLoaded) {
        clearWorkbenchCache();
        queryClient.removeQueries({ queryKey: WORKBENCH_QUERY_KEY });
        restoredFor.current = null;
        toRestore.current = undefined;
      }
      return;
    }
    if (restoredFor.current !== ownerKey) {
      // Staff or org switched under a live tab: the previous identity's
      // workbench reads must not be shown or persisted as the new one's.
      queryClient.removeQueries({ queryKey: WORKBENCH_QUERY_KEY });
      restoredFor.current = ownerKey;
      toRestore.current = undefined;
    }
    clearWorkbenchCache(ownerKey);

    const { persister, flush, cancel } = createSessionPersister(ownerKey, () => toRestore.current !== undefined);
    const unsubscribe = persistQueryClientSubscribe({
      queryClient,
      persister,
      buster: WORKBENCH_CACHE_BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => isWorkbenchQueryKey(query.queryKey) && query.state.status === 'success',
        shouldDehydrateMutation: () => false,
      },
    });
    window.addEventListener('pagehide', flush);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      cancel();
    };
  }, [ownerKey, isLoaded, queryClient]);

  return null;
}
