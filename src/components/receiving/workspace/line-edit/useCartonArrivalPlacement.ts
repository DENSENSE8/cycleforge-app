'use client';

/**
 * Unbox LPN putaway writer for an open LPN with no receiving line (unfound) —
 * `POST /api/receiving/[id]/arrival` place, the same write the Arrival phone
 * screen uses. Its read (`qk.cartons.arrival`) is the pill's face; it sits
 * under `['receiving']`, so the receiving realtime feed refreshes it when the
 * phone places the LPN.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { fetchArrivalPackage, postArrivalAction } from '@/lib/receiving/arrival-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { toast } from '@/lib/toast';

export function useCartonArrivalPlacement(receivingId: number | null) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: qk.cartons.arrival(receivingId ?? 0),
    queryFn: () => fetchArrivalPackage(receivingId!),
    enabled: receivingId != null,
    staleTime: 15_000,
  });
  const location = query.data?.location ?? null;

  /** Returns whether the write LANDED (see useUnboxLinePlacement). */
  const place = useCallback(
    async (scanned: string): Promise<boolean> => {
      if (receivingId == null || busy) return false;
      setBusy(true);
      try {
        const pkg = await postArrivalAction(receivingId, {
          action: 'place',
          scanned,
          clientEventId: safeRandomUUID(),
          surface: UNBOX_SURFACE_ROUTE,
        });
        queryClient.setQueryData(qk.cartons.arrival(receivingId), pkg);
        void queryClient.invalidateQueries({ queryKey: qk.cartons.unboxNext() });
        const from = location?.code ?? '';
        const to = pkg.location?.code ?? scanned;
        toast.success(from && from !== to ? `Location ${from} → ${to}` : `Location → ${to}`);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not place the LPN');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, location, queryClient, receivingId],
  );

  return { location, busy, place };
}
