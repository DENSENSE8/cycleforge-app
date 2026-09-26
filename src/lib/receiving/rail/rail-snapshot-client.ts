'use client';

/** Client half of the receiving rail first-paint seed (Upstash-backed). */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { RAIL_SNAPSHOT_MAX_ROWS } from './rail-snapshot-cache';

/** The viewer's last-known rows for a rail feed, or null. Never throws. */
export async function fetchRailSnapshot(feedParam: string): Promise<ReceivingLineRow[] | null> {
  try {
    const res = await fetch(
      `/api/receiving/rail-snapshot?feed=${encodeURIComponent(feedParam)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { rows?: ReceivingLineRow[] } | null;
    const rows = body?.rows;
    return Array.isArray(rows) && rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

// Debounced, per-feed, fire-and-forget persistence.
const PERSIST_DEBOUNCE_MS = 800;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function persistRailSnapshot(feedParam: string, rows: ReceivingLineRow[]): void {
  if (typeof window === 'undefined') return;
  // Never overwrite a good Upstash seed with an empty list (transient empty
  // refetches must not poison the next reload's first paint).
  if (rows.length === 0) return;
  const existing = timers.get(feedParam);
  if (existing) clearTimeout(existing);
  const snapshot = rows.slice(0, RAIL_SNAPSHOT_MAX_ROWS);
  timers.set(
    feedParam,
    setTimeout(() => {
      timers.delete(feedParam);
      void fetch('/api/receiving/rail-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed: feedParam, rows: snapshot }),
        keepalive: true, // survive a navigation/unload fired right after the write
      }).catch(() => {});
    }, PERSIST_DEBOUNCE_MS),
  );
}
