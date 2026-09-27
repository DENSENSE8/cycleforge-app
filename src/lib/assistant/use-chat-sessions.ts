'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_CHAT_NEW_EVENT, AI_CHAT_SESSIONS_CHANGED_EVENT } from '@/lib/app-events';
import type { ChatSessionRow } from '@/lib/assistant/chat-persistence';

export type { ChatSessionRow };

/**
 * The signed-in staffer's recent chat threads — ONE fetcher for every surface
 * that lists them (`GET /api/ai/chat-sessions`, keyset-paged).
 *
 * Deliberately NOT react-query: the list is small, read only while the
 * sidebar shows it, and every write that changes it broadcasts
 * {@link AI_CHAT_NEW_EVENT} / {@link AI_CHAT_SESSIONS_CHANGED_EVENT}, which
 * this hook listens to instead of polling. A reload resets to the first page.
 */
export function useChatSessions({
  enabled = true,
  limit = 30,
  q = '',
}: { enabled?: boolean; limit?: number; q?: string } = {}) {
  const [sessions, setSessions] = useState<ChatSessionRow[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Drops a stale response when a reload or a new query overtakes it.
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (before: string | null) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/ai/chat-sessions?${params}`);
      if (!res.ok) return null;
      return (await res.json()) as { sessions?: ChatSessionRow[]; nextBefore?: string | null };
    },
    [limit, q],
  );

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    try {
      const page = await fetchPage(null);
      if (!page || gen !== generation.current) return;
      setSessions(page.sessions ?? []);
      setNextBefore(page.nextBefore ?? null);
    } catch {
      // Offline or a 500: keep whatever the surface already painted rather
      // than blanking a list the operator is reading.
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loading) return;
    const gen = generation.current;
    setLoading(true);
    try {
      const page = await fetchPage(nextBefore);
      if (!page || gen !== generation.current) return;
      const more = page.sessions ?? [];
      setSessions((prev) => {
        const seen = new Set((prev ?? []).map((s) => s.id));
        return [...(prev ?? []), ...more.filter((s) => !seen.has(s.id))];
      });
      setNextBefore(page.nextBefore ?? null);
    } catch {
      // Keep the rows already shown; "Show more" stays available to retry.
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [fetchPage, loading, nextBefore]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onChange = () => void reload();
    window.addEventListener(AI_CHAT_NEW_EVENT, onChange);
    window.addEventListener(AI_CHAT_SESSIONS_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(AI_CHAT_NEW_EVENT, onChange);
      window.removeEventListener(AI_CHAT_SESSIONS_CHANGED_EVENT, onChange);
    };
  }, [enabled, reload]);

  return { sessions, nextBefore, loading, reload, loadMore };
}
