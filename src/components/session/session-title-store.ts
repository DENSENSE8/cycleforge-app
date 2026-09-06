'use client';

/**
 * Session title store — the panel publishes the live thread's name; the
 * GlobalHeader switcher subscribes. Module store, same pattern as
 * composer-seed-store: bump a seq, `useSyncExternalStore` on the far side.
 * Cross-component on purpose: the title lives where the chat state lives
 * (the panel), while the trigger face lives in the persistent header.
 */

import { useSyncExternalStore } from 'react';

export interface SessionHeaderState {
  title: string;
}

let seq = 0;
let state: SessionHeaderState = { title: 'New conversation' };
const listeners = new Set<() => void>();

export function publishSessionTitle(title: string): void {
  const next = title.trim() || 'New conversation';
  if (next === state.title) return;
  state = { title: next };
  seq += 1;
  for (const listener of listeners) listener();
}

export function subscribeSessionTitle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionTitleSeq(): number {
  return seq;
}

export function getSessionTitle(): SessionHeaderState {
  return state;
}

/**
 * Subscribe to the live thread's name. Two surfaces need it — the header
 * switcher's trigger face and the spine's current-session row — and both were
 * about to hand-roll the same `useSyncExternalStore` call.
 */
export function useSessionTitle(): string {
  return useSyncExternalStore(
    subscribeSessionTitle,
    () => state.title,
    () => state.title,
  );
}
