'use client';

/** The open task's email references (which customer email, on which mailbox, it came from) as a query, plus full CRUD — read and written as rows of the task's Links. */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailRefFromPaste } from '@/lib/tasks/task-email-refs';
import {
  TASK_EMAIL_REF_REFUSAL_COPY,
  type TaskEmailRef,
  type TaskEmailRefPatchBody,
  type TaskEmailRefsPayload,
} from '@/lib/tasks/task-email-refs-shared';

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    const reason = typeof data.error === 'string' ? data.error : '';
    throw new Error(
      (TASK_EMAIL_REF_REFUSAL_COPY as Readonly<Record<string, string>>)[reason] ?? (reason || `Request failed (${res.status})`),
    );
  }
  return data as T;
}

export function useTaskEmailRefs(taskId: number | null) {
  const queryClient = useQueryClient();
  const queryKey = ['tasks', 'email-refs', taskId] as const;
  const queryFn = async (): Promise<TaskEmailRefsPayload> =>
    readJson<TaskEmailRefsPayload>(await fetch(`/api/tasks/${taskId}/email-refs`, { cache: 'no-store' }));
  const query = useQuery({ queryKey, enabled: taskId != null, queryFn });

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'email-refs', taskId] });
  }, [queryClient, taskId]);

  /**
   * Link a pasted address / header block as an email reference. The org's
   * mailbox vocabulary is read first when it has not landed yet — a paste can
   * beat the first GET, and the mailbox default comes from it.
   */
  const link = useMutation({
    mutationFn: async (raw: string): Promise<TaskEmailRef> => {
      const payload = await queryClient.ensureQueryData({ queryKey, queryFn });
      if (!payload.ready) throw new Error(TASK_EMAIL_REF_REFUSAL_COPY.not_set_up);
      const body = emailRefFromPaste(raw, payload.mailboxes);
      if (!body) throw new Error('No customer address in that — paste the customer’s email or the email’s From / To lines.');
      const res = await fetch(`/api/tasks/${taskId}/email-refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await readJson<{ ref: TaskEmailRef }>(res)).ref;
    },
    onSettled: settle,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: TaskEmailRefPatchBody & { id: number }): Promise<TaskEmailRef> => {
      const res = await fetch(`/api/tasks/${taskId}/email-refs?refId=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return (await readJson<{ ref: TaskEmailRef }>(res)).ref;
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: async (refId: number) => {
      await readJson(await fetch(`/api/tasks/${taskId}/email-refs?refId=${refId}`, { method: 'DELETE' }));
    },
    onSettled: settle,
  });

  return {
    refs: query.data?.refs ?? [],
    mailboxes: query.data?.mailboxes ?? [],
    loading: query.isLoading,
    error: query.error,
    link,
    update,
    remove,
  };
}
