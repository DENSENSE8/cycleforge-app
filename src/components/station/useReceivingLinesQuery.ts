'use client';

/** Spine-first query layer for the receiving/unbox lines table — the ONE hook every consumer of a table view's rows mounts (the table's… */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  receivingLinesTableQuery,
  type ReceivingLinesListResponse,
} from '@/lib/queries/receiving-queries';
import type {
  ReceivingModeContext,
  ReceivingModeDescriptor,
  ReceivingTableMode,
} from '@/lib/receiving/receiving-modes';

/** Modes that paint spine-first. */
const SPINE_FIRST_MODES: ReadonlySet<ReceivingTableMode> = new Set([
  'unbox_queue',
  'unbox_viewed',
  'history',
] as const);

interface UseReceivingLinesQueryArgs {
  mode: ReceivingModeDescriptor;
  modeContext: ReceivingModeContext;
  /** Gate both phases (e.g. the Incoming delivered-* facets bypass this query). */
  enabled?: boolean;
}

interface ReceivingLinesQueryResult {
  /** Best rows available right now — authoritative `full` when it has landed, else the spine. */
  data: ReceivingLinesListResponse | undefined;
  /** True only while NOTHING is paintable yet (spine and full both unsettled). */
  isLoading: boolean;
  /** No data and the authoritative fetch failed — show the retryable error state. */
  isError: boolean;
  /** Retry the authoritative fetch. */
  refetch: () => void;
}

export function useReceivingLinesQuery({
  mode,
  modeContext,
  enabled = true,
}: UseReceivingLinesQueryArgs): ReceivingLinesQueryResult {
  const queryClient = useQueryClient();
  const spineEligible = SPINE_FIRST_MODES.has(mode.id);

  const fullOptions = receivingLinesTableQuery(mode, modeContext, 'full');
  const spineOptions = receivingLinesTableQuery(mode, modeContext, 'spine');

  // A warm full cache (tab flip back within gcTime) makes the spine pointless —
  // skip it entirely and serve the cached authoritative rows on frame 1.
  const hasFullCache =
    queryClient.getQueryData<ReceivingLinesListResponse>(fullOptions.queryKey) !== undefined;

  const spineQuery = useQuery<ReceivingLinesListResponse>({
    ...spineOptions,
    enabled: enabled && spineEligible && !hasFullCache,
    // Bootstrap-only tier: the full query owns freshness after first paint.
    refetchOnWindowFocus: false,
    gcTime: 60_000,
  });

  const fullQuery = useQuery<ReceivingLinesListResponse>({
    ...fullOptions,
    // Sequenced after the spine settles (success OR error) so the two list
    // queries never race the DB; non-spine modes keep today's immediate fetch.
    enabled: enabled && (!spineEligible || hasFullCache || spineQuery.isFetched),
    refetchOnWindowFocus: true,
  });

  const data = fullQuery.data ?? (spineEligible ? spineQuery.data : undefined);

  return {
    data,
    isLoading: data === undefined && (fullQuery.isLoading || spineQuery.isLoading),
    isError: data === undefined && fullQuery.isError,
    refetch: () => {
      void fullQuery.refetch();
    },
  };
}
