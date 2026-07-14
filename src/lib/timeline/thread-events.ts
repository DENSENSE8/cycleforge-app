import type { TimelineItem, TimelineTone } from './types';

/**
 * One thread message row (`thread_messages`, migration
 * 2026-07-14_entity_threads.sql), as returned by the thread/journey queries.
 * Kept structurally local so the adapter never imports the server-only
 * domain module (`src/lib/threads/threads.ts`) — same discipline as
 * `WarrantyEventRow`.
 */
export interface ThreadMessageTimelineRow {
  id: number;
  visibility: string; // 'internal' | 'public'
  provider: string; // 'internal' | 'zendesk' | 'system'
  body: string;
  createdAt: string | null;
  authorName?: string | null;
}

const PREVIEW_MAX = 140;

/** visibility → display noun + tone. Owned here, never in a view. */
const VISIBILITY_MAP: Record<string, { noun: string; tone: TimelineTone }> = {
  internal: { noun: 'Note', tone: 'muted' },
  public: { noun: 'Reply', tone: 'info' },
};

function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX - 1)}…` : flat;
}

/**
 * Map conversation-thread messages → {@link TimelineItem}s for the shared
 * `EventTimeline` (D4 — the merged history gains message rows; no second
 * timeline component). A row reads "Note — Riley · <body preview>"; the
 * interactive chat surface is the separate `ThreadPanel`, never this.
 */
export function threadMessagesToTimeline(rows: ThreadMessageTimelineRow[]): TimelineItem[] {
  return rows.map((r) => {
    const mapped = VISIBILITY_MAP[r.visibility] ?? VISIBILITY_MAP.internal;
    return {
      id: `thread:${r.id}`,
      at: r.createdAt,
      title: mapped.noun,
      tone: mapped.tone,
      subtitle: preview(r.body),
      actor: r.authorName ?? undefined,
      sourceEventType: 'THREAD_MESSAGE',
    } satisfies TimelineItem;
  });
}
