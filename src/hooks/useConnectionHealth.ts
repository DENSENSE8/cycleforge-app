'use client';

/** The connection-health hooks — one source for every offline / degraded surface. */

import { useEffect, useReducer, useSyncExternalStore } from 'react';
import {
  REALTIME_DEGRADE_GRACE_MS,
  isRealtimeDegraded,
  type RealtimeLinkHealth,
} from '@/lib/realtime/connection-health';
import {
  getRealtimeConnectionSnapshot,
  getServerRealtimeConnectionSnapshot,
  subscribeRealtimeConnection,
} from '@/lib/realtime/connection-store';

function subscribeOnline(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

function getOnlineSnapshot(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/** SSR optimistic — first paint matches the overwhelmingly common case. */
function getServerOnlineSnapshot(): boolean {
  return true;
}

/** `navigator.onLine`, shared. Use this instead of a fifth window listener. */
export function useNetworkOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
}

interface RealtimeLink {
  /** Raw Ably state. Diagnostic only — never render it (§4 copy discipline). */
  state: string;
  health: RealtimeLinkHealth;
  /** Debounced: true only once the link has genuinely stopped coming back. */
  degraded: boolean;
}

/** The station's realtime link, debounced. */
export function useRealtimeLink(graceMs: number = REALTIME_DEGRADE_GRACE_MS): RealtimeLink {
  const snapshot = useSyncExternalStore(
    subscribeRealtimeConnection,
    getRealtimeConnectionSnapshot,
    getServerRealtimeConnectionSnapshot,
  );
  const [, tick] = useReducer((n: number) => n + 1, 0);

  const heldMs = snapshot.changedAt === 0 ? 0 : Date.now() - snapshot.changedAt;
  const degraded = isRealtimeDegraded({ health: snapshot.health, heldMs, graceMs });

  useEffect(() => {
    if (snapshot.health !== 'wobbling' || degraded) return;
    const remaining = Math.max(0, graceMs - (Date.now() - snapshot.changedAt));
    // +25ms so the re-read lands strictly after the threshold rather than on it.
    const timer = setTimeout(tick, remaining + 25);
    return () => clearTimeout(timer);
  }, [snapshot, degraded, graceMs]);

  return { state: snapshot.state, health: snapshot.health, degraded };
}
