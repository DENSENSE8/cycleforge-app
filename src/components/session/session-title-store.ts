'use client';

/**
 * Session title store — the panel publishes the live thread's name; the
 * GlobalHeader switcher subscribes. Module store, same pattern as
 * composer-seed-store: notify the listener set, `useSyncExternalStore` on the
 * far side (the state object is replaced only on a real change, so it is itself
 * the snapshot).
 * Cross-component on purpose: the title lives where the chat state lives
 * (the panel), while the trigger face lives in the persistent header.
 */

import { useSyncExternalStore } from 'react';

export interface SessionHeaderState {
  title: string;
  /**
   * The thread the title belongs to, or `null` when there is nothing to write
   * to yet (a conversation with no message has no row).
   *
   * The header needs the ID, not just the name: renaming in place is a write
   * against `/api/ai/chat-sessions/[id]`, and the URL only carries a session
   * once one has been REOPENED — a live thread you just started is on `/`.
   * The panel is the one place that knows both, so it publishes both.
   */
  sessionId: string | null;
}

let state: SessionHeaderState = { title: 'New conversation', sessionId: null };
const listeners = new Set<() => void>();

export function publishSessionTitle(title: string, sessionId: string | null = null): void {
  const next = title.trim() || 'New conversation';
  if (next === state.title && sessionId === state.sessionId) return;
  state = { title: next, sessionId };
  for (const listener of listeners) listener();
}

export function subscribeSessionTitle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionTitle(): SessionHeaderState {
  return state;
}

/**
 * Subscribe to the live thread's name and id. `state` is replaced only when
 * something changed, so the object itself is a safe `useSyncExternalStore`
 * snapshot — no per-render allocation to tear on.
 */
export function useSessionHeader(): SessionHeaderState {
  return useSyncExternalStore(subscribeSessionTitle, getSessionTitle, getSessionTitle);
}
