/** Realtime connection state — a module store, deliberately NOT the Ably context. */

import { classifyRealtimeState, type RealtimeLinkHealth } from './connection-health';

interface RealtimeConnectionSnapshot {
  /** Raw Ably `connection.state`. Diagnostic only — never render this. */
  state: string;
  health: RealtimeLinkHealth;
  /** `Date.now()` of the last transition; `0` while nothing has been heard. */
  changedAt: number;
}

const INITIAL: RealtimeConnectionSnapshot = {
  state: 'initialized',
  health: 'unknown',
  changedAt: 0,
};

let snapshot: RealtimeConnectionSnapshot = INITIAL;
const listeners = new Set<() => void>();

/** Publish a transition. */
export function setRealtimeConnectionState(next: string | null | undefined): void {
  const state = String(next ?? '').trim() || 'initialized';
  if (state === snapshot.state) return;
  snapshot = { state, health: classifyRealtimeState(state), changedAt: Date.now() };
  for (const listener of listeners) listener();
}

/** Back to "we have not heard" — for provider teardown (sign-out, unmount). */
export function resetRealtimeConnectionState(): void {
  setRealtimeConnectionState('initialized');
}

export function subscribeRealtimeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRealtimeConnectionSnapshot(): RealtimeConnectionSnapshot {
  return snapshot;
}

/** SSR / hydration: nothing has been heard yet, and that is the honest answer. */
export function getServerRealtimeConnectionSnapshot(): RealtimeConnectionSnapshot {
  return INITIAL;
}
