/**
 * Chat threads as recents rows — the `assistant.sessions` surface. Client-safe
 * (pure): the server adapter maps `listAssistantSessions` rows through it, and
 * the `/ai-chat` page maps its live thread through it, so the optimistic row
 * and the server row it becomes are the same row.
 */

import type { NavRecentRow } from '@/lib/nav/context/schema';
import { displaySessionTitle } from '@/lib/ai/session-title-text';

export const ASSISTANT_SESSION_ENTITY_TYPE = 'assistant_session';

/** A thread with no title yet — the word the chat header uses for it. */
const NEW_CONVERSATION = 'New conversation';

export function assistantSessionHref(sessionId: string): string {
  return `/ai-chat?session=${encodeURIComponent(sessionId)}`;
}

export function assistantSessionRecentRow(session: {
  id: string;
  title: string | null;
  updatedAt: string;
}): NavRecentRow {
  return {
    id: `${ASSISTANT_SESSION_ENTITY_TYPE}:${session.id}`,
    entityType: ASSISTANT_SESSION_ENTITY_TYPE,
    entityId: session.id,
    title: displaySessionTitle(session.title, NEW_CONVERSATION),
    subtitle: null,
    status: null,
    at: session.updatedAt,
    href: assistantSessionHref(session.id),
  };
}
