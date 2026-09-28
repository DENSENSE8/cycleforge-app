import { noteMentionsToPlain } from '@/lib/orders/note-mentions';
import type { TimelineItem } from './types';

/** One `order_notes` row as the order timeline route returns it (structural twin of `OrderNoteTimelineRow`). */
export interface OrderNoteEventRow {
  id: string | number;
  noteText: string | null;
  createdAt: string | null;
  authorName?: string | null;
}

const PREVIEW_MAX = 140;

/** Map internal order notes → {@link TimelineItem}s; @mention tokens render as `@Name`. */
export function orderNotesToTimeline(rows: readonly OrderNoteEventRow[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const r of rows) {
    const flat = noteMentionsToPlain(String(r.noteText ?? '')).replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    out.push({
      id: `ordernote:${r.id}`,
      at: r.createdAt,
      title: 'Note',
      tone: 'muted',
      subtitle: flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX - 1)}…` : flat,
      actor: r.authorName?.trim() || undefined,
      sourceEventType: 'ORDER_NOTE',
    });
  }
  return out;
}
