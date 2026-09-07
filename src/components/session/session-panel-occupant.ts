/**
 * Who owns the RIGHT pane of the session surface.
 *
 * The pane has exactly ONE occupant at a time — the artifact view or the home
 * board — because two surfaces competing for the same column is the bug this
 * store exists to prevent. `useSessionArtifacts` already models the artifact
 * stack as a single-occupant slot; this is the same idea one level up.
 *
 * A module store rather than context, for the same reason the artifact store
 * is one: the openers are not all React children of the surface (⌘B lives on
 * the panel today, the global header and the spine are the obvious next
 * doors), and a routed verb must be able to reach the pane from anywhere.
 *
 * The board is NOT a route. `/` is the assistant surface and the board is a
 * pane occupant on it, so opening the board must not lose the live thread —
 * the same reason START→SPLIT is a state change and not a navigation.
 */

import { useSyncExternalStore } from 'react';

export type SessionPanelOccupant = 'artifact' | 'board';

// Default is the BOARD (the mission pane) since 2026-09-06: the right pane's
// resting face is the floor, and artifacts push it aside the moment the model
// renders one. Closing an artifact returns here.
let occupant: SessionPanelOccupant = 'board';
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable snapshot — a fresh object here would spin `useSyncExternalStore`. */
function getSnapshot(): SessionPanelOccupant {
  return occupant;
}

/** Server render has no pane open; the store is client state. */
function getServerSnapshot(): SessionPanelOccupant {
  return 'board';
}

export function setSessionPanelOccupant(next: SessionPanelOccupant): void {
  if (occupant === next) return;
  occupant = next;
  emit();
}

/**
 * Plain read, outside React — the artifact store promotes the pane on arrival
 * and the tests assert what the surface will switch on.
 */
export function getSessionPanelOccupant(): SessionPanelOccupant {
  return occupant;
}

export function toggleHomeBoard(): void {
  setSessionPanelOccupant(occupant === 'board' ? 'artifact' : 'board');
}

export function useSessionPanelOccupant(): SessionPanelOccupant {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
