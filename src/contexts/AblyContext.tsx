'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, ReactNode } from 'react';
import {
  resetRealtimeConnectionState,
  setRealtimeConnectionState,
} from '@/lib/realtime/connection-store';

interface AblyContextValue {
  /** Returns the shared Ably Realtime client (or null if unavailable). */
  getClient: () => Promise<any | null>;
}

const AblyContext = createContext<AblyContextValue>({
  getClient: () => Promise.resolve(null),
});

/**
 * AblyProvider — mounts exactly ONE Ably Realtime connection for the whole app.
 * All data hooks share this single connection via useAblyChannel(), which prevents
 * the per-hook client pattern from exhausting Ably concurrent-connection limits.
 */
export interface AblyProviderProps {
  children: ReactNode;
  /**
   * Token endpoint. Defaults to the STAFF route.
   *
   * The kiosk passes `/api/realtime/kiosk-token`: a tablet authenticates as a
   * device principal with no staff session and no permissions, so it cannot
   * mint from the staff route at all — and loosening that route to let it would
   * hand an unattended screen the whole org's dashboard feed.
   */
  authUrl?: string;
}

export function AblyProvider({ children, authUrl: authUrlProp }: AblyProviderProps) {
  const clientRef = useRef<any>(null);
  const pendingRef = useRef<((client: any | null) => void)[]>([]);
  const readyRef = useRef(false);

  // useCallback with empty deps so the returned function is referentially
  // stable across renders. Without this, every parent re-render minted a new
  // `getClient` → new context value → all consumer effects that listed
  // `getClient` in their deps re-fired, which is how the packer wizard
  // publish-state effect ended up flooding Ably at >1000 msg/s.
  const getClient = useCallback((): Promise<any | null> => {
    if (readyRef.current) return Promise.resolve(clientRef.current);
    return new Promise<any | null>((resolve) => {
      pendingRef.current.push(resolve);
    });
  }, []);

  const contextValue = useMemo(() => ({ getClient }), [getClient]);

  useEffect(() => {
    let disposed = false;
    let connection: any = null;
    let onStateChange: ((change: any) => void) | null = null;
    const authUrl =
      authUrlProp || process.env.NEXT_PUBLIC_ABLY_AUTH_PATH || '/api/realtime/token';

    import('ably')
      .then((Ably) => {
        if (disposed) return;
        const client = new Ably.Realtime({ authUrl });
        clientRef.current = client;
        readyRef.current = true;

        // Connection state is published to a MODULE STORE, never added to the
        // context value above — that value must stay referentially stable (see
        // its comment: widening it is how the >1000 msg/s flood happened, and
        // this state changes on every reconnect). The store also reaches the
        // global banner, which is mounted ABOVE this provider in the tree.
        connection = client.connection;
        setRealtimeConnectionState(connection?.state);
        onStateChange = (change: any) =>
          setRealtimeConnectionState(change?.current ?? connection?.state);
        connection?.on?.(onStateChange);

        pendingRef.current.forEach((r) => r(client));
        pendingRef.current = [];
      })
      .catch((err) => {
        console.error('[ably] Failed to initialise client:', err);
        // A client that never loaded is a dead realtime link, not an unknown
        // one — say so, or the bench silently loses live updates forever.
        if (!disposed) setRealtimeConnectionState('failed');
        readyRef.current = true;
        pendingRef.current.forEach((r) => r(null));
        pendingRef.current = [];
      });

    return () => {
      disposed = true;
      try {
        if (onStateChange) connection?.off?.(onStateChange);
      } catch {}
      try {
        clientRef.current?.close();
      } catch {}
      clientRef.current = null;
      readyRef.current = false;
      // Teardown (sign-out / unmount) is not a degraded link.
      resetRealtimeConnectionState();
    };
  }, [authUrlProp]);

  return (
    <AblyContext.Provider value={contextValue}>
      {children}
    </AblyContext.Provider>
  );
}

export function useAblyClient() {
  return useContext(AblyContext);
}
