'use client';

/**
 * The connection-health hooks — one source for every offline / degraded surface.
 *
 * Before this, four surfaces each ran their own `navigator.onLine` listener and
 * none of them knew about Ably at all (retired layout/mobile OfflineBanner twins,
 * a dead `station/OfflineBanner`, and an inline `useOnline` in
 * `OperationsTvBoard`). Wiring realtime health into any one of them would have
 * left the rest confidently telling the old, now-incomplete story — and a bench
 * that says "online" while the station's realtime link is dead is worse than a
 * bench that says nothing.
 *
 * Realtime is infrastructure, not an operator-facing connection badge. The
 * **answer** still must not fork per surface.
 *
 * Decision law lives in `@/lib/realtime/connection-health` (pure, unit-tested);
 * these hooks only wire it to the browser and the store.
 */

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

/**
 * The station's realtime link, debounced.
 *
 * A `wobbling` link (Ably `disconnected`) is not reported until it has held for
 * {@link REALTIME_DEGRADE_GRACE_MS} — nothing in the store fires on a timer, so
 * the hook schedules exactly one wake-up at the moment the grace expires and
 * re-reads. One timeout per transition, not a polling interval.
 */
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
