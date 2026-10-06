'use client';

/** What has already come through the door, from the server. */

import { useQuery } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  mobileFeedParams,
  mobileFeedQueryKey,
} from '@/lib/receiving/mobile-feed-query-key';
import { arrivalHistoryEntries } from './arrival-station-tape';

/** `enabled: false` reads nothing until the operator asks (the scan page's "Recent scans"). */
export function useArrivalHistory({ enabled }: { enabled: boolean }) {
  const query = useQuery({
    queryKey: mobileFeedQueryKey('triage'),
    queryFn: async (): Promise<ReceivingLineRow[]> => {
      const res = await fetch(`/api/receiving-lines?${mobileFeedParams('triage').toString()}`);
      if (!res.ok) throw new Error(`arrival history failed (${res.status})`);
      const json = (await res.json()) as { receiving_lines?: ReceivingLineRow[] };
      return Array.isArray(json.receiving_lines) ? json.receiving_lines : [];
    },
    // A starting point, not a live feed: once the operator is scanning, THIS
    // session is the truth and a refetch would fight it.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled,
  });

  return {
    history: query.data ? arrivalHistoryEntries(query.data) : [],
    /** Asked for and still on its first read. */
    loading: query.isLoading,
    /** True when the history could not be read — NOT the same as an empty door. */
    isError: query.isError,
    retry: query.refetch,
  };
}
