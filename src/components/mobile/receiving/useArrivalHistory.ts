'use client';

/**
 * What has already come through the door, from the server.
 *
 * The station's tape is a SESSION tape — the right shape while scanning and the
 * wrong one the moment the phone reloads, is handed to the next shift, or comes
 * back from a break. An arrival station that opens on empty canvas makes "did
 * somebody already scan this pallet in?" unanswerable without walking to a desk,
 * which is the question the door asks most.
 *
 * So the tape starts seeded from the SAME feed the desktop recent-arrivals rail
 * reads — `view=scanned&sort=priority`, keyed by `mobileFeedQueryKey('triage')`.
 * Reusing that key is what keeps the server paint seed
 * (`seedMobileReceivingFeed('triage')`, mounted by `/m/triage`) working: the
 * first HTML already carries these rows, so the tape paints without a fetch.
 *
 * One row per CARTON, not per line. The feed is line-level — a five-line PO is
 * five rows of one box — and a tape that listed each line would report five
 * arrivals for one delivery.
 */

import { useQuery } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  mobileFeedParams,
  mobileFeedQueryKey,
} from '@/lib/receiving/mobile-feed-query-key';
import { arrivalHistoryEntries } from './arrival-station-tape';

export function useArrivalHistory() {
  const query = useQuery({
    // The key the `/m/triage` server seed dehydrates into, to the character.
    queryKey: mobileFeedQueryKey('triage'),
    queryFn: async (): Promise<ReceivingLineRow[]> => {
      const res = await fetch(`/api/receiving-lines?${mobileFeedParams('triage').toString()}`);
      if (!res.ok) throw new Error(`arrival history failed (${res.status})`);
      const json = (await res.json()) as { receiving_lines?: ReceivingLineRow[] };
      return Array.isArray(json.receiving_lines) ? json.receiving_lines : [];
    },
    // The seed is a starting point, not a live feed: once the operator is
    // scanning, THIS session is the truth and a refetch would fight it.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    history: query.data ? arrivalHistoryEntries(query.data) : [],
    /** True when the seed could not be read — NOT the same as an empty door. */
    isError: query.isError,
    retry: query.refetch,
  };
}
