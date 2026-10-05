'use client';

/**
 * After a door scan settles on a package (new `arrived` or already `known`),
 * walk the operator to its pairing step (`/m/r/[id]/place`): urgency, then
 * scan any location. The arrival read is prefetched under the place screen's
 * own key so that screen paints without a spinner.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { fetchArrivalPackage } from '@/lib/receiving/arrival-client';

export function useArrivalPlacementHandoff(from: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(
    (settled: { status: string; receivingId: number | null }) => {
      const id = settled.receivingId;
      if ((settled.status !== 'arrived' && settled.status !== 'known') || id == null) return;
      void queryClient.prefetchQuery({ queryKey: qk.cartons.arrival(id), queryFn: () => fetchArrivalPackage(id) });
      router.push(withJobReturn(`/m/r/${id}/place`, from));
    },
    [from, queryClient, router],
  );
}
