'use client';

/**
 * Client half of the receiving rail first-paint seed (Upstash-backed). A rail
 * GETs its last-known rows to paint a reload immediately, and POSTs the rows it
 * just rendered so the next reload has a seed. Both are best-effort: a failed
 * GET falls back to the skeleton, a failed POST just means a cold next reload.
 *
 * The `feedParam` is fully client-composed (see rail-snapshot-cache.ts), so the
 * read and write keys can never drift; the server namespaces it by org + viewer.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
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

// Debounced, per-feed, fire-and-forget persistence. Rails settle their rows
// several times on load (seed → authoritative → optimistic patches); debouncing
// collapses that into one write. Keyed by feedParam so sibling rails don't share
// a timer.
const PERSIST_DEBOUNCE_MS = 800;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function persistRailSnapshot(feedParam: string, rows: ReceivingLineRow[]): void {
  if (typeof window === 'undefined') return;
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
