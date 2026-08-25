'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  clearActiveSession,
  getActiveSession,
  getServerActiveSession,
  setActiveSession,
  subscribeActiveSession,
  type ActiveSession,
} from './store';

/**
 * Read the live session. Returns null when the operator has nothing open —
 * consumers render nothing rather than inventing a placeholder identity.
 */
export function useActiveSession(): ActiveSession | null {
  return useSyncExternalStore(
    subscribeActiveSession,
    getActiveSession,
    getServerActiveSession,
  );
}

/**
 * Publish this surface's session. A session tile calls this instead of the
 * header reaching down for a route key.
 *
 * Runs on every render on purpose: the store compares by VALUE, so restating an
 * unchanged session costs one comparison, while a dependency array over a
 * nested `entity` / `status` literal would either churn every render or go
 * stale. Passing `null` releases the slot; so does unmounting, but only if this
 * session still owns it.
 */
export function usePublishSession(session: ActiveSession | null): void {
  const owned = useRef<string | null>(null);

  useEffect(() => {
    if (session) {
      owned.current = session.id;
      setActiveSession(session);
      return;
    }
    if (owned.current) {
      clearActiveSession(owned.current);
      owned.current = null;
    }
  });

  useEffect(
    () => () => {
      if (owned.current) clearActiveSession(owned.current);
      owned.current = null;
    },
    [],
  );
}
