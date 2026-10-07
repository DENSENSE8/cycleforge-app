'use client';

/**
 * The Records sheet's lines — `GET /api/nav/records` over the page's URL (the
 * params `src/lib/nav/records/params.ts` names, passed through as they are;
 * the server reads them with `readRecordsQuery`) — as `LocatedRecords`, the
 * shape the house sheet reads. One request per URL change: React Query keys
 * it by the params and aborts the stale one (its `signal`); no per-row ask.
 * The statuses are sidebar facets, so the answer carries no buckets; a
 * pasted number drops out of `?refs=` through `remove`. The twin of
 * `useFulfilledList` / `usePurchasesList`.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNavRecords } from '@/lib/nav/context/http-client';
import type { NavRecordsResponse } from '@/lib/nav/context/schema';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import type { BulkEntry, LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
import { RECORDS_REFS_PARAM, RECORDS_SORT_PARAM, recordsApiParams } from '@/lib/nav/records/params';
import { parseRefInParam, serializeRefIn, type RefSelection } from '@/lib/receiving/reconcile';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';

const NO_REPEATS: ReadonlyMap<string, number> = new Map();
const NO_BUCKETS: LocatedRecords['buckets'] = [];

/** The React Query root every Records read is keyed under — a write invalidates it. */
export const NAV_RECORDS_QUERY_ROOT = 'nav-records';

export interface RecordsList extends LocatedRecords {
  /** Lines every filter keeps, before the row cap. */
  total: number;
  /** `total` passed `RECORDS_ROW_LIMIT`: the sheet holds the first that many. */
  truncated: boolean;
  /** The pasted numbers (`?refs=`), parsed with the paste's own cap; empty = Query mode. */
  refs: RefSelection;
  /** Replace `?refs=` (an empty list = Query mode). */
  writeRefs: (refs: readonly string[]) => void;
  facets: NavRecordsResponse['facets'] | null;
}

export function useRecordsList(): RecordsList {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const staffKey = useNavStaffKey();
  const search = searchParams?.toString() ?? '';
  // The read's own params (`recordsApiParams` — the facet read builds the same, so rows and counts agree); grain is the client's.
  const api = useMemo(() => recordsApiParams(new URLSearchParams(search)), [search]);
  const apiKey = api.toString();
  const query = useQuery({
    queryKey: [NAV_RECORDS_QUERY_ROOT, staffKey, apiKey],
    queryFn: ({ signal }) => fetchNavRecords(api, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const entries = useMemo(() => (query.data?.entries ?? []).map((entry): BulkEntry => ({ ...entry, pending: false })), [query.data]);
  const rawRefs = searchParams?.get(RECORDS_REFS_PARAM) ?? null;
  const refs = useMemo(() => parseRefInParam(rawRefs), [rawRefs]);
  const writeRefs = useCallback(
    (next: readonly string[]) =>
      replace((params) => {
        if (next.length === 0) {
          params.delete(RECORDS_REFS_PARAM);
          if (params.get(RECORDS_SORT_PARAM) === 'pasted') params.delete(RECORDS_SORT_PARAM);
        } else {
          params.set(RECORDS_REFS_PARAM, serializeRefIn(next));
          if (!params.get(RECORDS_SORT_PARAM)) params.set(RECORDS_SORT_PARAM, 'pasted');
        }
      }),
    [replace],
  );
  // A list arriving from the search bar (`recordsHref`) carries no sort: the sidebar's Sort row must
  // read "As pasted", the order the read answers in (`readRecordsQuery`'s paste default).
  const sortMissing = refs.refs.length > 0 && !searchParams?.get(RECORDS_SORT_PARAM);
  useEffect(() => {
    if (sortMissing) replace((params) => params.set(RECORDS_SORT_PARAM, 'pasted'));
  }, [sortMissing, replace]);
  // A write changes the counts too: the sidebar's facets (NavFilters, `nav-facets`) re-read with the rows.
  const queryClient = useQueryClient();
  const rowsRefetch = query.refetch;
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['nav-facets'] });
    return rowsRefetch();
  }, [queryClient, rowsRefetch]);
  return {
    scope: 'everywhere',
    loading: query.isFetching,
    error: query.error ? query.error.message || 'Could not read the records' : null,
    refetch: () => void refetch(),
    entries,
    buckets: NO_BUCKETS,
    status: null,
    setStatus: () => undefined,
    facet: null,
    // The read answers as a whole: asking again for one line re-reads the list.
    recheck: () => void refetch(),
    repeats: NO_REPEATS,
    // A pasted number leaves the list (a ref the paste holds); a query's line has no such verb.
    remove: refs.refs.length > 0 ? (ref) => writeRefs(refs.refs.filter((held) => held !== ref)) : undefined,
    total: query.data?.total ?? 0,
    truncated: query.data?.truncated ?? false,
    refs,
    writeRefs,
    facets: query.data?.facets ?? null,
  };
}
