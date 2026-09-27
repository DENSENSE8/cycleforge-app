'use client';

/**
 * Live recents — the seam between a page body that holds a record the server
 * feed has not listed yet (a chat thread whose first turn is in flight) and
 * the sidebar's recents list for that surface. The page publishes the row;
 * the list shows it on top until the feed returns it. Module store, not React
 * context, for the same reason as nav intents: the sidebar and the page body
 * live in different subtrees of the shell. One live row per surface; last
 * writer wins.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { NavRecentRow } from '@/lib/nav/context/schema';

const live = new Map<string, NavRecentRow>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Publish `row` as `surface`'s live record; returns the retract. */
export function publishNavLiveRecent(surface: string, row: NavRecentRow): () => void {
  live.set(surface, row);
  emit();
  return () => {
    if (live.get(surface) !== row) return;
    live.delete(surface);
    emit();
  };
}

/** The page side: keep `row` published while mounted and non-null. Pass a memoised row. */
export function usePublishNavLiveRecent(surface: string, row: NavRecentRow | null): void {
  useEffect(() => (row ? publishNavLiveRecent(surface, row) : undefined), [surface, row]);
}

/** The sidebar side: the surface's live record, or null. */
export function useNavLiveRecent(surface: string): NavRecentRow | null {
  return useSyncExternalStore(
    subscribe,
    () => live.get(surface) ?? null,
    () => null,
  );
}
