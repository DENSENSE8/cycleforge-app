'use client';

/** Desk search — one in-memory query per desk path, shared by every mounted reader. */

import { useCallback, useSyncExternalStore } from 'react';

const queries = new Map<string, string>();
const listeners = new Set<() => void>();
const focusListeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDeskSearch(key: string, value: string): void {
  if ((queries.get(key) ?? '') === value) return;
  queries.set(key, value);
  for (const listener of listeners) listener();
}

export function getDeskSearch(key: string): string {
  return queries.get(key) ?? '';
}

/** `[query, setQuery]` for one desk path — same shape as `useState('')`. */
export function useDeskSearch(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => getDeskSearch(key),
    () => '',
  );
  const set = useCallback((next: string) => setDeskSearch(key, next), [key]);
  return [value, set];
}

/**
 * Ask the sidebar search to take focus — the collapsed rail's search button and
 * the `/` chord both land here, whichever tree they live in.
 */
export function requestDeskSearchFocus(): void {
  for (const listener of focusListeners) listener();
}

export function subscribeDeskSearchFocus(listener: () => void): () => void {
  focusListeners.add(listener);
  return () => focusListeners.delete(listener);
}
