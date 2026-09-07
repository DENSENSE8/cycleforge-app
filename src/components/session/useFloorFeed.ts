'use client';

/**
 * The mission pane's live floor feed — "what is happening on the floor now".
 *
 * ONE read-only source: `/api/activity/feed` (station activity logs unioned
 * with stock-ledger deltas, org-scoped by the route's tenancy layer). The
 * feed is ambient telemetry, not a worklist — it renders and NEVER writes,
 * never seeds, never links out (the read-only mission-pane law).
 *
 * Refresh mirrors `useOperatorPulse`: mount, window focus, and a 30s tick —
 * only while the tab is visible, and a failed poll keeps the last good feed
 * so a network blip never blanks the floor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 30_000;
const LIMIT = 40;

export interface FloorEvent {
  id: number;
  station: string | null;
  activityType: string | null;
  staffName: string | null;
  scanRef: string | null;
  notes: string | null;
  createdAt: string;
}

/** Snake-case tool/station strings → the eyebrow a strip tag wears. */
function tagOf(event: FloorEvent): string {
  const raw = event.station ?? event.activityType ?? '';
  const word = raw.replace(/_/g, ' ').trim();
  return word ? word.slice(0, 10).toUpperCase() : 'OPS';
}

/** The one line the feed shows: what moved, and who moved it. */
function bodyOf(event: FloorEvent): string {
  const ref = event.scanRef?.trim();
  const notes = event.notes?.trim();
  if (ref && notes) return `${ref} — ${notes}`;
  return ref || notes || tagOf(event).toLowerCase();
}

export function useFloorFeed(): { events: FloorEvent[]; loaded: boolean } {
  const [events, setEvents] = useState<FloorEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/activity/feed?limit=${LIMIT}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { activities?: unknown[] } | Array<unknown>;
      const rows = Array.isArray(data) ? data : (data.activities ?? []);
      if (!alive.current) return;
      setEvents(
        rows.map((row) => {
          const r = (row ?? {}) as Record<string, unknown>;
          return {
            id: Number(r.id) || 0,
            station: typeof r.station === 'string' ? r.station : null,
            activityType: typeof r.activity_type === 'string' ? r.activity_type : null,
            staffName: typeof r.staff_name === 'string' ? r.staff_name : null,
            scanRef: typeof r.scan_ref === 'string' ? r.scan_ref : null,
            notes: typeof r.notes === 'string' ? r.notes : null,
            createdAt: typeof r.created_at === 'string' ? r.created_at : '',
          };
        }),
      );
    } catch {
      /* keep the last good feed */
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  return { events, loaded };
}

/** Display helpers shared by the feed rows (kept beside the hook: one voice). */
export const floorFeedFace = { tagOf, bodyOf };
