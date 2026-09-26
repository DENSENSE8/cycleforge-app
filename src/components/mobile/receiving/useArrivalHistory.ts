'use client';

/** What has already come through the door, from the server. */

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
