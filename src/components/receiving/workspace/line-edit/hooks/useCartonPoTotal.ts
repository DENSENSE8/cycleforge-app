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

/**
 * The carton's purchase-order MONEY TOTAL for the station identity header.
 *
 * Carton grain by construction — it is a sum over the carton's lines. The qty
 * beside it is deliberately NOT from here: that reads the ACTIVE LINE straight
 * off `row`, so the band echoes the number the operator just saw in the rail.
 *
 * TWO observers, in priority order:
 *
 *  1. A READ-ONLY (`skipToken`) subscription to the sibling-lines cache that
 *     `usePoLinesData` (PO items accordion) owns. When the accordion is
 *     mounted this costs nothing and stays live with its optimistic writes.
 *  2. Failing that, its OWN fetch of the same endpoint under a separate key.
 *
 * The second observer exists because the identity band outlives the accordion:
 * the Unbox body no longer mounts PO lines by default, so a cache-only read
 * showed a permanent `—`. It is gated on `!shared` so the two never fetch the
 * same rows at once.
 *
 * Why a separate key rather than a second observer on the siblings key: that
 * query's fetcher carries forward optimistic/hydrated serials on every refetch,
 * and whichever observer's `queryFn` wins would decide whether that survives. A
 * naive twin on the shared key can blank a scanned serial — the exact bug the
 * accordion's carry-forward exists to prevent.
 */
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
    // One fetch per carton per 30s. This runs UNCONDITIONALLY rather than only
    // when the shared cache looks empty: two rounds of "is the accordion's
    // cache usable yet" heuristics both failed in the browser — first on an
    // `[]` between seeds, then on the one-line `placeholderData` the accordion
    // paints on a cold open, which has a length but no `unit_price`. A cache
    // that can legitimately hold a partial list cannot gate a fetch.
    staleTime: 30_000,
  });

  // Whichever source can actually answer wins. The shared cache is preferred
  // when it HAS a priced answer — it is live with the accordion's optimistic
  // writes — and the owned fetch backs it up the rest of the time.
  return cartonPoTotal(shared?.receiving_lines) ?? cartonPoTotal(own?.receiving_lines);
}
