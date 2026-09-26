import type { TimelineItem, TimelineTone } from './types';
import { searchHitHref } from '@/lib/search/search-hit';

/** One `ops_events` row (src/lib/ops-events.ts / migration 2026-06-30) — the newest polymorphic "SAL-style" event spine, used today for… */
export interface OpsEventRow {
  id: number;
  occurred_at: string | null;
  event_type: string;
  entity_type: string;
  entity_id: number;
  actor_name?: string | null;
  /** `ops_events.actor_staff_id` — resolves the actor's avatar. */
  actor_staff_id?: number | null;
}

/** event_type → display. */
const EVENT_MAP: Record<string, { title: string; tone: TimelineTone }> = {
  TRACKING_SCANNED: { title: 'Tracking scanned', tone: 'info' },
  UNBOX_SCAN_OPENED: { title: 'Unbox scan opened', tone: 'info' },
  UNBOX_CONFIRMED: { title: 'Unbox confirmed', tone: 'success' },
};

function pretty(eventType: string): string {
  const s = eventType.replace(/[._-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function opsEventHref(row: OpsEventRow): string | undefined {
  if (row.entity_type === 'receiving' && row.entity_id > 0) {
    return searchHitHref('RECEIVING', row.entity_id);
  }
  return undefined;
}

/** Map `ops_events` rows → {@link TimelineItem}s for the shared `EventTimeline`. */
export function opsEventsToTimeline(rows: OpsEventRow[]): TimelineItem[] {
  return rows.map((r) => {
    const mapped = EVENT_MAP[r.event_type];
    const title = mapped?.title ?? pretty(r.event_type);
    const tone = mapped?.tone ?? 'muted';

    return {
      id: `ops:${r.id}`,
      at: r.occurred_at,
      title,
      tone,
      actor: r.actor_name ?? undefined,
      actorStaffId: r.actor_staff_id ?? null,
      sourceEventType: r.event_type,
      href: opsEventHref(r),
    };
  });
}
