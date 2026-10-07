'use client';

/**
 * Whether a station next-action headline is on screen. While one is, it owns
 * "what to do next", so the header's static page line (`PAGE_NEXT_ACTIONS`)
 * steps aside instead of saying a second, staler thing. Idle stations keep it.
 */

import { useEffect, useSyncExternalStore } from 'react';

let shown = 0;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mount-scoped claim: the headline counts as shown for as long as it is mounted. */
export function useClaimStationHeadline(): void {
  useEffect(() => {
    shown += 1;
    publish();
    return () => {
      shown -= 1;
      publish();
    };
  }, []);
}

export function useStationHeadlineShown(): boolean {
  return useSyncExternalStore(subscribe, () => shown > 0, () => false);
}
