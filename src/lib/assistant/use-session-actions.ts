'use client';

import { useCallback } from 'react';
import { AI_CHAT_SESSIONS_CHANGED_EVENT } from '@/lib/app-events';

/**
 * Triage actions for one chat thread — the write side of the sidebar list.
 *
 * Rename, delete and restore hit `/api/ai/chat-sessions/[sessionId]` (PATCH
 * `{ title }` / soft DELETE / PATCH `{ restore: true }`), then broadcast
 * {@link AI_CHAT_SESSIONS_CHANGED_EVENT} so every mounted `useChatSessions`
 * refetches — one write, every list re-reads, no prop-drilled reload.
 */

async function sessionRequest(id: string, init: RequestInit): Promise<boolean> {
  const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(id)}`, init);
  if (res.ok) window.dispatchEvent(new CustomEvent(AI_CHAT_SESSIONS_CHANGED_EVENT));
  return res.ok;
}

const patch = (body: unknown): RequestInit => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function useSessionActions() {
  const renameSession = useCallback(async (id: string, title: string): Promise<boolean> => {
    const trimmed = title.trim();
    if (!trimmed) return false;
    return sessionRequest(id, patch({ title: trimmed }));
  }, []);

  const deleteSession = useCallback(
    (id: string): Promise<boolean> => sessionRequest(id, { method: 'DELETE' }),
    [],
  );

  /** The undo half of {@link deleteSession} — clears `deleted_at`. */
  const restoreSession = useCallback(
    (id: string): Promise<boolean> => sessionRequest(id, patch({ restore: true })),
    [],
  );

  return { renameSession, deleteSession, restoreSession };
}
