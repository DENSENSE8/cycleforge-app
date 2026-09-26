'use client';

/** Single-row rail dismiss for the ⋮ menu — the per-row half of the flow the Select verb + bulk bar owns for a checked batch ({@link… */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { ReceivingRailFeedKey } from '@/lib/receiving/rail-exclusions';
import { dropRailRows, railExclusionItems, restoreRailRows } from './rail-dismiss';

const EXCLUSIONS_ENDPOINT = '/api/receiving/rail-exclusions';

export function useRailRowDismiss(feedKey: ReceivingRailFeedKey | null) {
  const queryClient = useQueryClient();

  return useCallback(
    async (railId: number, rowLabel: string) => {
      if (!feedKey || !Number.isFinite(railId)) return;
      const items = railExclusionItems([railId]);

      // Optimistic first: the row leaves on the gesture, not on the round trip.
      // A failed write puts it straight back, which is the same restore path
      // Undo uses — so there is exactly one way a dismissed row comes back.
      const echo = dropRailRows(queryClient, [railId]);

      const res = await fetch(EXCLUSIONS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedKey, items }),
      }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : null;

      if (!res?.ok || !body?.success) {
        restoreRailRows(queryClient, echo);
        toast.error(`Could not hide it: ${body?.error || res?.status || 'network error'}`);
        return;
      }

      // Refresh the exclusion set so the rail's read filter keeps the row
      // hidden through the next refetch (the optimistic drop alone would not).
      void queryClient.invalidateQueries({ queryKey: ['rail-exclusions', feedKey] });

      toast.success(`“${rowLabel}” hidden from your list`, {
        action: {
          label: 'Undo',
          onClick: () => {
            void (async () => {
              const undo = await fetch(EXCLUSIONS_ENDPOINT, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedKey, items }),
              }).catch(() => null);
              if (!undo?.ok) {
                toast.error('Could not restore that row');
                return;
              }
              // Order matters: drop the exclusion from the read filter BEFORE
              // the rails refetch, or the row is fetched and filtered out again.
              await queryClient.invalidateQueries({ queryKey: ['rail-exclusions', feedKey] });
              restoreRailRows(queryClient, echo);
            })();
          },
        },
      });
    },
    [feedKey, queryClient],
  );
}
