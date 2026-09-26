'use client';

/** Irreversible carton delete from the rail's ⋮ menu — the `danger` half of the row's CRUD, opposite the reversible Hide in… */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { requestConfirm } from '@/design-system/components/confirm';
import { removeReceivingRailByCarton } from '@/lib/queries/receiving-queries';

export function useRailRowDelete() {
  const queryClient = useQueryClient();

  return useCallback(
    async (receivingId: number, rowLabel: string) => {
      if (!Number.isFinite(receivingId) || receivingId <= 0) return;

      const ok = await requestConfirm({
        description:
          `Delete “${rowLabel}”? This removes the whole carton and every line on it, `
          + 'for everyone in the org. It cannot be undone — to clear it from just your '
          + 'own rail, use “Hide from my list” instead.',
        tone: 'danger',
        confirmLabel: 'Delete carton',
      });
      if (!ok) return;

      const res = await fetch(
        `/api/receiving-logs?id=${encodeURIComponent(String(receivingId))}`,
        { method: 'DELETE' },
      ).catch(() => null);

      // 404 = already gone. That is the outcome the operator asked for, so it
      // takes the success path rather than reporting a failure they cannot act on.
      if (!res || (!res.ok && res.status !== 404)) {
        const body = res ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
        toast.error(body?.error || `Delete failed${res ? ` (${res.status})` : ''}`);
        return;
      }

      removeReceivingRailByCarton(queryClient, receivingId);
      void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      window.dispatchEvent(new CustomEvent('receiving-entry-deleted', { detail: receivingId }));
      toast.success('Carton deleted');
    },
    [queryClient],
  );
}
