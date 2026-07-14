'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { EntityThread, ThreadMessage, ThreadMessageVisibility } from '@/lib/threads/types';

/**
 * TanStack Query hook behind the ThreadPanel — resolve/create the entity's
 * conversation thread and post messages with the house optimistic contract
 * (`onMutate` snapshot+apply → `onError` rollback → `onSettled` invalidate;
 * .claude/rules/display/workbench.md). A client-minted `clientEventId`
 * (safeRandomUUID) makes a flaky-network retry an idempotent no-op server-side.
 */

export const threadKeys = {
  thread: (entityType: string, entityId: number) => ['entity-thread', entityType, entityId] as const,
  messages: (threadId: number) => ['entity-thread-messages', threadId] as const,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

export function useThread(entityType: string, entityId: number | null | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const enabled = Boolean(entityType && entityId && entityId > 0);

  const threadQuery = useQuery({
    queryKey: threadKeys.thread(entityType, entityId ?? 0),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const data = await fetchJson<{ thread: EntityThread | null }>(
        `/api/threads?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`,
      );
      return data.thread;
    },
  });

  const threadId = threadQuery.data?.id ?? null;

  const messagesQuery = useQuery({
    queryKey: threadKeys.messages(threadId ?? 0),
    enabled: threadId != null,
    staleTime: 15_000,
    queryFn: async () => {
      const data = await fetchJson<{ messages: ThreadMessage[] }>(
        `/api/threads/${threadId}/messages?limit=100`,
      );
      return data.messages;
    },
  });

  /** Get-or-create the thread (used on first post; idempotent server-side). */
  const ensureThread = useCallback(async (): Promise<EntityThread> => {
    const existing = queryClient.getQueryData<EntityThread | null>(
      threadKeys.thread(entityType, entityId ?? 0),
    );
    if (existing) return existing;
    const data = await fetchJson<{ thread: EntityThread }>('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType, entityId }),
    });
    queryClient.setQueryData(threadKeys.thread(entityType, entityId ?? 0), data.thread);
    return data.thread;
  }, [queryClient, entityType, entityId]);

  const postMessage = useMutation({
    mutationFn: async (input: { body: string; visibility: ThreadMessageVisibility }) => {
      const thread = await ensureThread();
      const clientEventId = safeRandomUUID();
      const data = await fetchJson<{ message: ThreadMessage; idempotent: boolean }>(
        `/api/threads/${thread.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, clientEventId }),
        },
      );
      return { ...data, threadId: thread.id };
    },
    onMutate: async (input) => {
      // Optimistic append — only possible when the thread already exists
      // (first-ever message settles through the invalidate instead).
      if (threadId == null) return { snapshot: null as ThreadMessage[] | null, threadId: null };
      const key = threadKeys.messages(threadId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<ThreadMessage[]>(key) ?? null;
      const optimistic: ThreadMessage = {
        id: -Date.now(),
        threadId,
        authorStaffId: user?.staffId ?? null,
        authorName: user?.name ?? null,
        provider: 'internal',
        visibility: input.visibility,
        body: input.body,
        clientEventId: null,
        meta: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<ThreadMessage[]>(key, [...(snapshot ?? []), optimistic]);
      return { snapshot, threadId };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.threadId != null && ctx.snapshot) {
        queryClient.setQueryData(threadKeys.messages(ctx.threadId), ctx.snapshot);
      }
    },
    onSettled: (data) => {
      const settledThreadId = data?.threadId ?? threadId;
      if (settledThreadId != null) {
        void queryClient.invalidateQueries({ queryKey: threadKeys.messages(settledThreadId) });
      }
      void queryClient.invalidateQueries({ queryKey: threadKeys.thread(entityType, entityId ?? 0) });
    },
  });

  return {
    thread: threadQuery.data ?? null,
    threadLoading: enabled && threadQuery.isLoading,
    threadError: threadQuery.error as Error | null,
    messages: messagesQuery.data ?? [],
    messagesLoading: threadId != null && messagesQuery.isLoading,
    messagesError: messagesQuery.error as Error | null,
    postMessage,
  };
}
