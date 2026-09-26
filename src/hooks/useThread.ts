'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { EntityThread, ThreadMessage, ThreadMessageVisibility } from '@/lib/threads/types';

/** TanStack Query hook behind the ThreadPanel — resolve/create the entity's conversation thread and post messages with the house optimistic… */

const threadKeys = {
  thread: (entityType: string, entityId: number) => ['entity-thread', entityType, entityId] as const,
  messages: (threadId: number) => ['entity-thread-messages', threadId] as const,
  connections: (threadId: number) => ['entity-thread-connections', threadId] as const,
};

export interface ThreadConnectionRow {
  entityType: string;
  entityId: number | null;
  label: string;
  origin: 'derived' | 'link';
  href?: string | null;
  hint?: string | null;
}

export interface ThreadAssignmentRow {
  threadId: number;
  assignedStaffId: number;
  assignedStaffName?: string | null;
  assignedBy: number | null;
}

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

  // Connections ("connecting dots") + current owner — resolved once a thread exists.
  const connectionsQuery = useQuery({
    queryKey: threadKeys.connections(threadId ?? 0),
    enabled: threadId != null,
    staleTime: 30_000,
    queryFn: async () => {
      const data = await fetchJson<{
        connections: ThreadConnectionRow[];
        assignment: ThreadAssignmentRow | null;
      }>(`/api/threads/${threadId}/connections`);
      return data;
    },
  });

  const invalidateThread = () => {
    void queryClient.invalidateQueries({ queryKey: threadKeys.thread(entityType, entityId ?? 0) });
    if (threadId != null) {
      void queryClient.invalidateQueries({ queryKey: threadKeys.connections(threadId) });
    }
  };

  /** PATCH thread status (open | snoozed | resolved). */
  const setStatus = useMutation({
    mutationFn: async (status: 'open' | 'snoozed' | 'resolved') => {
      const thread = await ensureThread();
      return fetchJson<{ thread: EntityThread }>(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: (data) =>
      queryClient.setQueryData(threadKeys.thread(entityType, entityId ?? 0), data.thread),
  });

  /** Assign / reassign the thread owner. */
  const assign = useMutation({
    mutationFn: async (assignedStaffId: number) => {
      const thread = await ensureThread();
      return fetchJson(`/api/threads/${thread.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedStaffId }),
      });
    },
    onSuccess: invalidateThread,
  });

  const unassign = useMutation({
    mutationFn: async () => {
      if (threadId == null) return null;
      return fetchJson(`/api/threads/${threadId}/assign`, { method: 'DELETE' });
    },
    onSuccess: invalidateThread,
  });

  /** Edit a message body. */
  const editMessage = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: number; body: string }) => {
      if (threadId == null) throw new Error('no thread');
      return fetchJson(`/api/threads/${threadId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
    },
    onSuccess: () => {
      if (threadId != null) void queryClient.invalidateQueries({ queryKey: threadKeys.messages(threadId) });
    },
  });

  /** Soft-delete a message (optimistic removal). */
  const deleteMessage = useMutation({
    mutationFn: async (messageId: number) => {
      if (threadId == null) throw new Error('no thread');
      return fetchJson(`/api/threads/${threadId}/messages/${messageId}`, { method: 'DELETE' });
    },
    onMutate: async (messageId) => {
      if (threadId == null) return { snapshot: null as ThreadMessage[] | null };
      const key = threadKeys.messages(threadId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<ThreadMessage[]>(key) ?? null;
      queryClient.setQueryData<ThreadMessage[]>(key, (snapshot ?? []).filter((m) => m.id !== messageId));
      return { snapshot };
    },
    onError: (_e, _id, ctx) => {
      if (threadId != null && ctx?.snapshot) queryClient.setQueryData(threadKeys.messages(threadId), ctx.snapshot);
    },
    onSettled: () => {
      if (threadId != null) void queryClient.invalidateQueries({ queryKey: threadKeys.messages(threadId) });
    },
  });

  /** Curate / remove a cross-entity link. */
  const addLink = useMutation({
    mutationFn: async (input: { entityType: string; entityId: number; linkRole?: string }) => {
      const thread = await ensureThread();
      return fetchJson(`/api/threads/${thread.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    },
    onSuccess: invalidateThread,
  });

  /** Escalate the thread to a ticket (internal or zendesk); D6 attach seam. */
  const escalate = useMutation({
    mutationFn: async (mode: 'internal' | 'zendesk') => {
      const thread = await ensureThread();
      return fetchJson<{ thread: EntityThread; supportTicketId: number; created: boolean }>(
        `/api/threads/${thread.id}/escalate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        },
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData(threadKeys.thread(entityType, entityId ?? 0), data.thread);
      // Escalating writes ticket_links, which is what the connections strip derives its SUPPORT_TICKET dot from — but only the thread row was…
      if (data.thread?.id != null) {
        void queryClient.invalidateQueries({
          queryKey: threadKeys.connections(data.thread.id),
        });
      }
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
    escalate,
    connections: connectionsQuery.data?.connections ?? [],
    assignment: connectionsQuery.data?.assignment ?? null,
    connectionsLoading: threadId != null && connectionsQuery.isLoading,
    setStatus,
    assign,
    unassign,
    editMessage,
    deleteMessage,
    addLink,
  };
}
