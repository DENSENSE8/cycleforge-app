'use client';

/**
 * After a door scan logs a NEW carton, hand the operator to its put-down step
 * (`/m/r/[id]/place`) — but only when the org has urgency shelves: with none
 * configured the scan loop stays put rather than bouncing every box through a
 * screen that can only say so. The suggestion read also copies an inbound
 * order's tier onto a carton that has none, so the order's urgency reaches the box at the
 * door either way. The answer is cached under the place screen's own key, so
 * that screen paints instantly.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { fetchPlacementSuggestion } from '@/lib/receiving/arrival-placement-client';

export function useArrivalPlacementHandoff(from: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(
    (settled: { status: string; receivingId: number | null }) => {
      const id = settled.receivingId;
      if (settled.status !== 'arrived' || id == null) return;
      void queryClient
        .fetchQuery({
          queryKey: qk.cartons.placement(id),
          queryFn: () => fetchPlacementSuggestion(id),
        })
        .then((answer) => {
          if (!mounted.current || answer.suggestion.kind === 'no_shelves') return;
          router.push(withJobReturn(`/m/r/${id}/place`, from));
        })
        .catch((err: unknown) => {
          // The arrival itself is already recorded; a failed shelf lookup only
          // means the operator is not walked to the shelf this time.
          console.warn('[arrival-placement] suggestion failed', err);
        });
    },
    [from, queryClient, router],
  );
}
