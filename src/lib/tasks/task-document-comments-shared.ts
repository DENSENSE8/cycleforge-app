/**
 * Comments on a task document — the wire shape. One `entity_threads` row per
 * document (`entity_type = 'TASK_DOCUMENT'`, 2026-10-03 migration); each
 * comment is a `thread_messages` row whose `meta` carries the quoted passage
 * `{docId, quote, headingSlug}` (P6: comments anchor to the document,
 * attributed) plus `resolvedAt` / `resolvedByStaffId` once resolved.
 */

import type { ThreadMessage } from '@/lib/threads/types';

/** The quoted passage is a pointer, not a copy of the doc — a sentence or two is enough to find it. */
export const TASK_DOC_COMMENT_QUOTE_MAX = 500;
export const TASK_DOC_COMMENT_BODY_MAX = 4000;

export interface TaskDocComment {
  id: number;
  body: string;
  author: { id: number; name: string } | null;
  createdAt: string;
  /** The selected text the comment is about; null = a comment on the whole document. */
  quote: string | null;
  /** Slug of the heading the quote sits under (scroll target), when known. */
  headingSlug: string | null;
  resolvedAt: string | null;
  resolvedByStaffId: number | null;
}

export interface TaskDocCommentsPayload {
  ok: true;
  comments: TaskDocComment[];
}

export interface TaskDocCommentCreateBody {
  docId: number;
  body: string;
  quote?: string | null;
  headingSlug?: string | null;
  /** Client retry key — a re-POST with the same id lands nothing new. */
  clientEventId?: string | null;
}

export const TASK_DOC_COMMENT_REFUSAL_COPY: Readonly<Record<string, string>> = {
  task_not_found: 'That task no longer exists.',
  document_not_found: 'That document is no longer on this task.',
  comment_not_found: 'That comment was already removed.',
  not_author: 'Only the person who wrote a comment can remove it.',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** One thread message → one comment. Pure, so the mapping is testable without a DB. */
export function taskDocCommentFromMessage(message: ThreadMessage): TaskDocComment {
  const meta = message.meta ?? {};
  const resolvedBy = Number(meta.resolvedByStaffId);
  return {
    id: message.id,
    body: message.body,
    author:
      message.authorStaffId == null
        ? null
        : { id: message.authorStaffId, name: message.authorName?.trim() || `Staff #${message.authorStaffId}` },
    createdAt: message.createdAt,
    quote: text(meta.quote),
    headingSlug: text(meta.headingSlug),
    resolvedAt: text(meta.resolvedAt),
    resolvedByStaffId: Number.isInteger(resolvedBy) && resolvedBy > 0 ? resolvedBy : null,
  };
}
