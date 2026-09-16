'use client';

/**
 * Data layer for Home → Daily.
 *
 * ONE query per day (`GET /api/daily-checks?date=`) and three mutations. The
 * report shape comes back assembled from `lib/daily-checks/report` — this hook
 * never re-derives counts, so the surface and the API can never disagree about
 * who did what.
 *
 * Ticking is OPTIMISTIC: at a bench the operator taps and looks away, so the
 * round trip must not be in the way. The unique index makes the write
 * idempotent, and a failure rolls the cache back to the server's answer.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearMineFromReport } from '@/lib/daily-checks/reset-report';
import type {
  DailyCheckCreateInput,
  DailyCheckItem,
  DailyCheckReport,
} from '@/lib/daily-checks/types';

const KEY_PREFIX = ['daily-checks'] as const;
const dailyChecksKey = (dateKey: string) => [...KEY_PREFIX, dateKey] as const;

async function fetchReport(dateKey: string): Promise<DailyCheckReport> {
  const res = await fetch(`/api/daily-checks?date=${encodeURIComponent(dateKey)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`daily checks request failed (${res.status})`);
  return res.json() as Promise<DailyCheckReport>;
}

export function useDailyChecks(dateKey: string) {
  return useQuery({
    queryKey: dailyChecksKey(dateKey),
    queryFn: () => fetchReport(dateKey),
    staleTime: 15_000,
  });
}

/** Tick / untick one item for the signed-in staffer, optimistically. */
export function useToggleCheck(dateKey: string) {
  const queryClient = useQueryClient();
  const key = dailyChecksKey(dateKey);

  return useMutation({
    mutationFn: async ({ itemId, checked }: { itemId: number; checked: boolean }) => {
      const res = await fetch('/api/daily-checks/mark', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, checked, date: dateKey }),
      });
      if (!res.ok) throw new Error(`mark failed (${res.status})`);
    },

    onMutate: async ({ itemId, checked }) => {
      // Cancel first, or an in-flight refetch can land AFTER the patch and
      // silently undo the tick the operator just made.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DailyCheckReport>(key);
      if (!previous) return { previous };

      // Patch BOTH `mine` and the matching roster row: they are two views of
      // one fact, and updating only one makes the checklist and the report
      // below it disagree for the length of the round trip.
      const patchRow = (row: DailyCheckReport['mine']) => {
        if (row.staffId !== previous.mine.staffId) return row;
        const doneItemIds = checked
          ? row.doneItemIds.includes(itemId)
            ? row.doneItemIds
            : [...row.doneItemIds, itemId]
          : row.doneItemIds.filter((id) => id !== itemId);
        return { ...row, doneItemIds, doneCount: doneItemIds.length };
      };

      queryClient.setQueryData<DailyCheckReport>(key, {
        ...previous,
        mine: patchRow(previous.mine),
        staff: previous.staff.map(patchRow),
        totalDone: previous.totalDone + (checked ? 1 : -1),
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    // Reconcile against the server either way — the optimistic patch does not
    // know the mark's real instant, and the report renders it.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Reset all — clear MY ticks for this day. Optimistic like the tick: the
 * operator presses it at the end of a shift and walks away, so the list must
 * empty under the thumb rather than after a round trip.
 */
export function useResetDay(dateKey: string) {
  const queryClient = useQueryClient();
  const key = dailyChecksKey(dateKey);

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/daily-checks/mark?date=${encodeURIComponent(dateKey)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`reset failed (${res.status})`);
    },

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DailyCheckReport>(key);
      if (previous) queryClient.setQueryData(key, clearMineFromReport(previous));
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Add / rename / retire a list item. Admin-gated by the route (`admin.manage_staff`). */
export function useItemActions(dateKey: string) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: KEY_PREFIX }),
    [queryClient],
  );

  const addItem = useMutation({
    mutationFn: async (input: DailyCheckCreateInput): Promise<DailyCheckItem> => {
      const res = await fetch('/api/daily-checks/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `add failed (${res.status})`);
      }
      return res.json() as Promise<DailyCheckItem>;
    },
    onSuccess: invalidate,
  });

  /**
   * Rename a live item. NOT optimistic, unlike the tick: a tick is a personal
   * attestation the operator repeats a hundred times a shift, while a rename
   * changes the LIST every staffer reads — showing the new wording before the
   * server has taken it would show four people a title that might roll back.
   */
  const updateItem = useMutation({
    mutationFn: async (input: { itemId: number; title: string }): Promise<DailyCheckItem> => {
      const res = await fetch(`/api/daily-checks/items?id=${input.itemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: input.title }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `save failed (${res.status})`);
      }
      return res.json() as Promise<DailyCheckItem>;
    },
    onSuccess: invalidate,
  });

  const retireItem = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`/api/daily-checks/items?id=${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`retire failed (${res.status})`);
    },
    onSuccess: invalidate,
  });

  void dateKey; // keys are prefix-invalidated; the day does not scope a list edit
  return { addItem, updateItem, retireItem };
}
