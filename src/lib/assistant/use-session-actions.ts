'use client';

import { useCallback } from 'react';
import { AI_CHAT_SESSIONS_CHANGED_EVENT } from '@/lib/app-events';
import { SESSION_PIN_ICON_KEY } from '@/lib/quick-access/types';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import { displaySessionTitle } from '@/lib/ai/session-title-text';
import type { ChatSessionRow } from './use-chat-sessions';

/**
 * Triage actions for a single AI session — the write side of the spine's
 * Sessions list (Feature 2) and the header switcher.
 *
 * Rename, delete and restore hit `/api/ai/chat-sessions/[sessionId]` (PATCH
 * `{ title }` / soft DELETE / PATCH `{ restore: true }`), then broadcast
 * {@link AI_CHAT_SESSIONS_CHANGED_EVENT} so every
 * mounted {@link useChatSessions} refetches — one write, every list re-reads,
 * no prop-drilled reload. Pinning a session is a quick-access pin that carries
 * the session id (Feature 3, binding model B): a `/?session=<id>` destination
 * whose hover subtitle is the thread's AI title.
 */

/** The pinned destination for a session — a specific thread, not the / root. */
export function sessionPinHref(id: string): string {
  return `/?session=${encodeURIComponent(id)}`;
}

function emitSessionsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AI_CHAT_SESSIONS_CHANGED_EVENT));
}

async function patchSessionTitle(id: string, title: string): Promise<boolean> {
  const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return res.ok;
}

async function softDeleteSession(id: string): Promise<boolean> {
  const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

async function undeleteSession(id: string): Promise<boolean> {
  const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restore: true }),
  });
  return res.ok;
}

export function useSessionActions() {
  const { pin } = useQuickAccess();

  const renameSession = useCallback(async (id: string, title: string): Promise<boolean> => {
    const trimmed = title.trim();
    if (!trimmed) return false;
    const ok = await patchSessionTitle(id, trimmed);
    if (ok) emitSessionsChanged();
    return ok;
  }, []);

  const deleteSession = useCallback(async (id: string): Promise<boolean> => {
    const ok = await softDeleteSession(id);
    if (ok) emitSessionsChanged();
    return ok;
  }, []);

  /** The undo half of {@link deleteSession} — clears `deleted_at`. */
  const restoreSession = useCallback(async (id: string): Promise<boolean> => {
    const ok = await undeleteSession(id);
    if (ok) emitSessionsChanged();
    return ok;
  }, []);

  const pinSession = useCallback(
    (session: Pick<ChatSessionRow, 'id' | 'title'>) =>
      pin({
        kind: 'session',
        href: sessionPinHref(session.id),
        // A pin PERSISTS its label, so a raw title would be stuck in the shelf
        // long after the row it came from was fixed. `DisplayTitle` is what the
        // session branch of PinInput demands, so this is now type-enforced.
        label: displaySessionTitle(session.title, 'Session'),
        sessionId: session.id,
        iconKey: SESSION_PIN_ICON_KEY,
      }),
    [pin],
  );

  return { renameSession, deleteSession, restoreSession, pinSession };
}
