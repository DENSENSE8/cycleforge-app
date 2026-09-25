'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PomodoroAction, PomodoroResponse, PomodoroTarget } from './contract';

export type PomodoroKind = PomodoroTarget['kind'];

async function readPayload(res: Response): Promise<PomodoroResponse> {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Could not load the focus timer.');
  return body as PomodoroResponse;
}

export function usePomodoro(kind: PomodoroKind, id: number | null, date?: string) {
  const queryClient = useQueryClient();
  const key = ['pomodoro', kind, id, date ?? null] as const;
  const query = useQuery({
    queryKey: key,
    enabled: id != null,
    queryFn: async () => {
      const params = new URLSearchParams({ kind, id: String(id) });
      if (date) params.set('date', date);
      const payload = await readPayload(await fetch(`/api/pomodoro?${params}`, { cache: 'no-store' }));
      return { ...payload, receivedAtMs: Date.now() };
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: async (action: PomodoroAction) => {
      const payload = await readPayload(await fetch('/api/pomodoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, ...(date ? { date } : {}), action }),
      }));
      return { ...payload, receivedAtMs: Date.now() };
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(key, payload);
      void queryClient.invalidateQueries({ queryKey: ['pomodoro'], refetchType: 'inactive' });
    },
  });
  return { data: query.data, loading: query.isLoading, error: query.error ?? mutation.error, action: mutation.mutate, pending: mutation.isPending };
}
