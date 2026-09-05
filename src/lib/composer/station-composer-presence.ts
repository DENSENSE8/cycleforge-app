/**
 * How many {@link StationComposerHost} mouths are on screen, by kind.
 *
 * `station` — a floor station's own mouth (and Incoming extract). One is
 * enough to stand the desk field down entirely.
 *
 * `desk` — the desk field mounted as the chrome's LEAD COLUMN. The foot dock
 * is the same field in the shape a surface without desk chrome can wear, so it
 * must stand down whenever the column is already on screen: one screen, one
 * mouth, whichever shape it took.
 */

import { useSyncExternalStore } from 'react';

export type StationComposerPresenceKind = 'station' | 'desk';

let stationCount = 0;
let deskCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function registerStationComposerPresence(
  kind: StationComposerPresenceKind,
): () => void {
  if (kind !== 'station') return () => {};
  stationCount += 1;
  emit();
  return () => {
    stationCount = Math.max(0, stationCount - 1);
    emit();
  };
}

/**
 * The desk field mounted as the chrome's LEAD COLUMN.
 *
 * Registered by the lead column itself rather than by the host, because the
 * foot dock is the same host with the same `presenceKind` — if the host
 * registered, the foot dock would count ITSELF, hide, unregister and reappear
 * on a loop.
 */
export function registerDeskLeadPaneMouth(): () => void {
  deskCount += 1;
  emit();
  return () => {
    deskCount = Math.max(0, deskCount - 1);
    emit();
  };
}

export function getStationComposerDeskCount(): number {
  return deskCount;
}

/** Lead columns on screen. The foot dock stands down while this is > 0. */
export function useStationComposerDeskCount(): number {
  return useSyncExternalStore(
    subscribeStationComposerStationCount,
    getStationComposerDeskCount,
    () => 0,
  );
}

export function getStationComposerStationCount(): number {
  return stationCount;
}

export function subscribeStationComposerStationCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStationComposerStationCount(): number {
  return useSyncExternalStore(
    subscribeStationComposerStationCount,
    getStationComposerStationCount,
    () => 0,
  );
}
