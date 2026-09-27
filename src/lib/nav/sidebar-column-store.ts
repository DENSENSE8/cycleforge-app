'use client';

/**
 * Whether the left nav column is on screen — published by `DesktopRouteShell`
 * (the one owner of that state), read by a page that must move its own
 * controls in when the column is closed (e.g. the order list's Find).
 *
 * The column keeps its content mounted while closed, so "is the sidebar's
 * Find mounted" cannot answer this; only the shell knows.
 */

import { useSyncExternalStore } from 'react';

let columnOpen = true;
const listeners = new Set<() => void>();

export function setSidebarColumnOpen(next: boolean): void {
  if (columnOpen === next) return;
  columnOpen = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the nav column is open. Server / first paint: open (no page control moves in until the shell says so). */
export function useSidebarColumnOpen(): boolean {
  return useSyncExternalStore(subscribe, () => columnOpen, () => true);
}
