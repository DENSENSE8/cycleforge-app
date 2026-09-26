/** Helpdesk comments → {@link TimelineItem}, so a customer message is the same kind of row as a dock scan or a carrier event and the two… */
import type { TimelineItem } from './types';

/** An image/file attached to a helpdesk comment. */
export interface TicketAttachment {
  id: number;
  fileName: string;
  /** Full-resolution URL — what the shared photo viewer opens. */
  contentUrl: string;
  thumbnailUrl?: string | null;
}

/** The message-shaped payload a ledger row renders instead of title + subtitle. */
export interface TicketMessageDetail {
  /** Raw markdown source — the renderer owns the block scale. */
  body: string;
  authorName: string;
  authorEmail: string | null;
  /** Roster photo URL when the helpdesk has one (never guessed from a name). */
  authorPhoto: string | null;
  /** Cycle Forge staff id — app identity; Zendesk photo is unused when set. */
  authorStaffId: number | null;
  /** True when the author is one of ours (agent reply or any internal note). */
  ours: boolean;
  /** Not emailed to the customer — tinted AND labelled, never colour alone. */
  internal: boolean;
  attachments: TicketAttachment[];
}

/** A `TimelineItem` that may be a message rather than an event. */
export type MergedRecordItem = TimelineItem & { message?: TicketMessageDetail };

/** One helpdesk comment, already resolved to a display identity by the caller. */
export interface TicketCommentRow {
  id: number | string;
  at: string | null;
  body: string;
  /** `public === false` on the provider comment. */
  internal: boolean;
  authorName: string;
  authorEmail?: string | null;
  authorPhoto?: string | null;
  /** Present when this comment maps to a Cycle Forge staffer. */
  authorStaffId?: number | null;
  /** Agent reply, internal note, or our own optimistic echo. */
  ours: boolean;
  attachments?: TicketAttachment[];
}

export function zendeskCommentsToTimeline(rows: TicketCommentRow[]): MergedRecordItem[] {
  return rows.map((r) => ({
    id: `ticket-comment:${r.id}`,
    at: r.at,
    // The author IS the row's headline; the body lives on `message`.
    title: r.authorName,
    tone: r.internal ? 'warning' : 'default',
    actor: r.authorName,
    actorStaffId: r.authorStaffId ?? null,
    sourceEventType: r.internal ? 'TICKET_NOTE' : 'TICKET_MESSAGE',
    message: {
      body: r.body,
      authorName: r.authorName,
      authorEmail: r.authorEmail ?? null,
      authorPhoto: r.authorPhoto ?? null,
      authorStaffId: r.authorStaffId ?? null,
      ours: r.ours,
      internal: r.internal,
      attachments: r.attachments ?? [],
    },
  }));
}
