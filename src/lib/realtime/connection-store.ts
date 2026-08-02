/**
 * Realtime connection state — a module store, deliberately NOT the Ably context.
 *
 * ### Why this is not a context value
 *
 * `AblyContext`'s value is exactly `{ getClient }`, memoized on an empty-dep
 * `useCallback`, and its docblock records why: when that value changed on every
 * parent render, every consumer effect listing `getClient` in its deps re-fired,
 * and the packer wizard's publish-state effect **flooded Ably at >1000 msg/s**.
 *
 * `useAblyClient()` has ~23 consumers. Adding `connectionState` to that value
 * would make it change on every `connecting → connected → disconnected …`
 * transition — re-rendering all 23 and re-firing precisely those effects. The
 * connection state is exactly the kind of thing that changes often and is needed
 * by very few, which is what a `useSyncExternalStore` module store is for: the
 * two or three surfaces that render status re-render on a transition, and the
 * 23 client consumers never hear about it.
 *
 * The store is also the only shape that works for the **global** banner, which
 * is mounted at `src/app/layout.tsx` *above* `AuthenticatedAblyProvider` — it
 * could not read a context that does not enclose it.
 *
 * Program: `docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`
 * (P2 · D4).
 */

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

/**
 * Publish a transition. Called from `AblyProvider`'s effect only — a second
 * writer would make "who last set this" the question, and there is exactly one
 * Realtime client in the app by construction.
 *
 * A no-op on an unchanged state keeps the snapshot **referentially stable**,
 * which `useSyncExternalStore` requires: a fresh object per read would loop.
 */
export function setRealtimeConnectionState(next: string | null | undefined): void {
  const state = String(next ?? '').trim() || 'initialized';
  if (state === snapshot.state) return;
  snapshot = { state, health: classifyRealtimeState(state), changedAt: Date.now() };
  for (const listener of listeners) listener();
}

/**
 * Back to "we have not heard" — for provider teardown (sign-out, unmount).
 *
 * Deliberately not `'closed'`: a client we deliberately disposed is not a
 * degraded link, and reporting it as one would light the banner on every
 * sign-out.
 */
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
