'use client';

/**
 * The pasted list held in the URL (`/search/list`, route spec
 * `PASTED_LIST_ROUTE_PARAMS`): `?refs=` (the numbers), `?locator=` (whose
 * buckets), `?status=` (one bucket), `?rep=` (repeats), `?sort=` (the order).
 * ONE reader for the page body (the sheet) and its contextual sidebar (the
 * bucket facet + Sort — ruling A1/A4: record selection is sidebar chrome).
 * Both call the same `useBulkList` over the same React Query key, so the
 * sidebar asks nothing new.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { NAV_LOCATE_SCOPES, type NavLocateScope } from '@/lib/nav/context/schema';
import { parsePastedListRepeats } from '@/lib/nav/route-tree';
import { useBulkList, type BulkList } from '@/lib/nav/locate/use-bulk-list';
import { parseRefInParam, serializeRefIn } from '@/lib/receiving/reconcile';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { BULK_LIST_DEFAULT_SORT, type BulkListSort } from './bulk-list-view';

const REFS_PARAM = 'refs';
const LOCATOR_PARAM = 'locator';
const STATUS_PARAM = 'status';
const REPEATS_PARAM = 'rep';
/** `?sort=` — `<by>` ascending, `<by>-desc` descending; unset = as pasted (options: `NAV_PAGE_DECLS.search.controls.sort`). */
const SORT_PARAM = 'sort';

/** The URL's list — the page body and its sidebar facet read the same one. */
export function useUrlBulkList(): BulkList {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const rawScope = searchParams?.get(LOCATOR_PARAM) ?? '';
  const scope: NavLocateScope = (NAV_LOCATE_SCOPES as readonly string[]).includes(rawScope)
    ? (rawScope as NavLocateScope)
    : 'everywhere';
  const raw = searchParams?.get(REFS_PARAM) ?? null;
  const selection = useMemo(() => parseRefInParam(raw), [raw]);
  const status = searchParams?.get(STATUS_PARAM)?.trim() || null;
  const rawRepeats = searchParams?.get(REPEATS_PARAM) ?? null;
  const repeats = useMemo(() => parsePastedListRepeats(rawRepeats), [rawRepeats]);
  const writeRefs = useCallback(
    (refs: readonly string[]) =>
      replace((params) => {
        if (refs.length === 0) {
          params.delete(REFS_PARAM);
          params.delete(STATUS_PARAM);
        } else {
          params.set(REFS_PARAM, serializeRefIn(refs));
        }
      }),
    [replace],
  );
  const setStatus = useCallback(
    (next: string | null) =>
      replace((params) => {
        if (next) params.set(STATUS_PARAM, next);
        else params.delete(STATUS_PARAM);
      }),
    [replace],
  );
  return useBulkList(scope, selection, status, null, writeRefs, setStatus, repeats);
}

/** The list's order, in `?sort=` — the sidebar's Sort row writes it, the page's S key cycles it. */
export function useUrlBulkListSort(): [BulkListSort, (next: BulkListSort) => void] {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const raw = searchParams?.get(SORT_PARAM) ?? '';
  const sort = useMemo((): BulkListSort => {
    const [by, dir] = raw.split('-');
    if (by !== 'id' && by !== 'status') return BULK_LIST_DEFAULT_SORT;
    return { by, dir: dir === 'desc' ? 'desc' : 'asc' };
  }, [raw]);
  const setSort = useCallback(
    (next: BulkListSort) =>
      replace((params) => {
        if (next.by === 'pasted') params.delete(SORT_PARAM);
        else params.set(SORT_PARAM, next.dir === 'desc' ? `${next.by}-desc` : next.by);
      }),
    [replace],
  );
  return [sort, setSort];
}
