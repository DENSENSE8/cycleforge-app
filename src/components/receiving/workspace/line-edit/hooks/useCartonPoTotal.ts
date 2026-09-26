'use client';

import { useQuery, skipToken } from '@tanstack/react-query';

import {
  receivingSiblingsQueryKey,
  type ReceivingSiblingsCache,
} from '@/lib/queries/receiving-queries';
import { cartonPoTotal, type PoTotalLine } from '@/lib/receiving/po-total';

type PricedSiblingLine = PoTotalLine & { id: number };
type SiblingsEnvelope = ReceivingSiblingsCache<PricedSiblingLine>;

/** Own key — deliberately NOT the siblings key (see the two-observer note below). */
function cartonPoTotalQueryKey(receivingId: number) {
  return ['carton-po-total', receivingId] as const;
}

/** The carton's purchase-order MONEY TOTAL for the station identity header. */
export function useCartonPoTotal(receivingId: number | null): number | null {
  const enabled = receivingId != null && Number.isFinite(receivingId) && receivingId > 0;
  const id = enabled ? receivingId : 0;

  const { data: shared } = useQuery<SiblingsEnvelope>({
    queryKey: receivingSiblingsQueryKey(id),
    queryFn: skipToken,
    enabled,
  });

  const { data: own } = useQuery<SiblingsEnvelope>({
    queryKey: cartonPoTotalQueryKey(id),
    queryFn: async () => {
      const res = await fetch(`/api/receiving-lines?receiving_id=${id}`);
      if (!res.ok) throw new Error('Failed to fetch carton lines');
      return (await res.json()) as SiblingsEnvelope;
    },
    enabled,
    // One fetch per carton per 30s.
    staleTime: 30_000,
  });

  // The OWNED fetch wins, and the shared cache is only a fallback — the reverse order is a silent-wrong-number hazard, not a preference.
  return cartonPoTotal(own?.receiving_lines) ?? cartonPoTotal(shared?.receiving_lines);
}
