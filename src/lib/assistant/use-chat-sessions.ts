'use client';

import { useCallback, useEffect, useState } from 'react';
import { AI_CHAT_NEW_EVENT } from '@/lib/app-events';

/**
 * Recent agent sessions — ONE fetcher for every surface that lists them.
 *
 * `GET /api/ai/chat-sessions` returns the 30 most recent sessions with a
 * message count. Two surfaces list them: the header {@link SessionSwitcher}
 * dropdown and the nav spine's Sessions section. They had one fetch each for
 * about a day, which is two request paths, two loading states and two
 * definitions of "recent" for one list.
 *
 * The list is deliberately NOT in react-query: it is small, it is only read
 * while a menu or a section is open, and the one write that changes it
 * (starting a session) already broadcasts {@link AI_CHAT_NEW_EVENT}, which is
 * what this hook listens to instead of polling.
 */
export interface ChatSessionRow {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

export function useChatSessions({ enabled = true }: { enabled?: boolean } = {}) {
  const [sessions, setSessions] = useState<ChatSessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat-sessions');
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: ChatSessionRow[] };
      setSessions(data.sessions ?? []);
    } catch {
      // Offline or a 500: keep whatever the surface already painted rather
      // than blanking a list the operator is reading.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled) return undefined;
    // A new session renames nothing until its first turn lands, so this is a
    // refetch on the verb, not an optimistic insert.
    const onNew = () => void reload();
    window.addEventListener(AI_CHAT_NEW_EVENT, onNew);
    return () => window.removeEventListener(AI_CHAT_NEW_EVENT, onNew);
  }, [enabled, reload]);

  return { sessions, loading, reload };
}
