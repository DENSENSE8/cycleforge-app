/**
 * How many {@link StationComposerHost} mouths are on the floor vs a desk
 * fallback. Scan stations (and Incoming extract) register `station`. The desk
 * fallback must not paint a second dock when that count is > 0.
 */

import { useSyncExternalStore } from 'react';

export type StationComposerPresenceKind = 'station' | 'desk';

let stationCount = 0;
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
