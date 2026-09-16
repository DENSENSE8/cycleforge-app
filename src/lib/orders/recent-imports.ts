'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

export const RECENT_IMPORT_WINDOW_MS = 5 * 60 * 1_000;

let snapshot: ReadonlyMap<number, number> = new Map();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlyMap<number, number> {
  return snapshot;
}

function isRecent(importedAt: number, now: number): boolean {
  return importedAt <= now && now - importedAt < RECENT_IMPORT_WINDOW_MS;
}

export function markRecentlyImportedOrders(orderIds: readonly number[], importedAt = Date.now()): void {
  const now = Date.now();
  const next = new Map(
    Array.from(snapshot).filter(([, priorImportedAt]) => isRecent(priorImportedAt, now)),
  );

  for (const rawId of orderIds) {
    const orderId = Number(rawId);
    if (Number.isFinite(orderId) && orderId > 0) next.set(orderId, importedAt);
  }

  snapshot = next;
  notify();
}

export function formatRecentImportAge(importedAt: number, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - importedAt) / 1_000));
  if (elapsedSeconds < 60) return `New · ${elapsedSeconds}s`;
  return `New · ${Math.floor(elapsedSeconds / 60)}m`;
}

export function useRecentImportedOrders(): ReadonlyMap<number, string> {
  const imports = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  return useMemo(
    () => new Map(
      Array.from(imports)
        .filter(([, importedAt]) => isRecent(importedAt, now))
        .map(([orderId, importedAt]) => [orderId, formatRecentImportAge(importedAt, now)]),
    ),
    [imports, now],
  );
}
