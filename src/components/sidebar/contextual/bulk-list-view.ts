'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NAV_LOCATE_NOWHERE, type NavLocateBucket } from '@/lib/nav/context/schema';
import type { BulkEntry, BulkList } from '@/lib/nav/locate/use-bulk-list';
import { primaryBucketId } from '@/lib/nav/locate/bucket-precedence';
import { setDeskSearch, useDeskSearch } from '@/lib/outbound/desk-search-store';
import { recordDetailsNavigation } from '@/lib/records/record-details';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import type { PageFind } from './NavFind';

/** How the held list is ordered — one state for the bar's panel and the full screen. */
export interface BulkListSort {
  by: 'pasted' | 'id' | 'status';
  dir: 'asc' | 'desc';
}

export const BULK_LIST_DEFAULT_SORT: BulkListSort = { by: 'pasted', dir: 'asc' };

/** The sort state a face holds for both of its list surfaces. */
export function useBulkListSort() {
  return useState<BulkListSort>(BULK_LIST_DEFAULT_SORT);
}

/** One bucket holding a row's number, and whether it is the list on screen. */
export interface RowBucket {
  bucket: NavLocateBucket;
  /** The list on screen — Enter narrows it instead of navigating. */
  current: boolean;
  /** Another section's bucket (`<locator>:<id>` under a section locator): found elsewhere. */
  elsewhere: boolean;
}

/** One pasted number with its paste position and the buckets it sits in. */
export interface BulkRowView {
  entry: BulkEntry;
  /** 1-based, in paste order. */
  position: number;
  /** Every bucket holding it — membership (filters, counts, pinpoint). */
  buckets: RowBucket[];
  /** The ONE status it is painted with (`primaryBucketId`'s precedence); undefined = found nowhere. */
  primary: RowBucket | undefined;
}

const ORDER_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Another section's bucket: under a section locator its id is
 * `<locator>:<id>` (the section's own keep bare ids). Under `everywhere`
 * every id is prefixed and none is "elsewhere".
 */
export function isElsewhereBucket(bucket: Pick<NavLocateBucket, 'id'>, scope: BulkList['scope']): boolean {
  return scope !== 'everywhere' && bucket.id.includes(':');
}

/**
 * Status order = bucket order of the PAINTED status: numbers found nowhere
 * lead (they need a person), then each number by its one status's bucket.
 */
function sortRows(rows: readonly BulkRowView[], sort: BulkListSort, bucketRank: ReadonlyMap<string, number>): BulkRowView[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  if (sort.by === 'pasted') return sign === 1 ? [...rows] : [...rows].reverse();
  if (sort.by === 'status') {
    const rank = (row: BulkRowView) =>
      row.primary ? (bucketRank.get(row.primary.bucket.id) ?? Number.MAX_SAFE_INTEGER) : -1;
    return [...rows].sort((a, b) => sign * (rank(a) - rank(b)) || a.position - b.position);
  }
  return [...rows].sort((a, b) => sign * ORDER_COLLATOR.compare(a.entry.ref, b.entry.ref));
}

/**
 * Is `href` the list on screen? Same pathname, every param the href sets
 * holds the same value here, and no view-defining param (one any bucket href
 * sets) is set here to something the href does not say.
 */
function isCurrentView(href: string, pathname: string, current: URLSearchParams, viewKeys: ReadonlySet<string>): boolean {
  const url = new URL(href, 'http://local');
  if (url.pathname !== pathname) return false;
  for (const [key, value] of url.searchParams) if (current.get(key) !== value) return false;
  for (const key of viewKeys) if (!url.searchParams.has(key) && current.has(key)) return false;
  return true;
}

/** What {@link useBulkListView} hands a list surface. */
export interface BulkListView {
  /** The Find text the pinpoint toggles. */
  find: string;
  /** Every pasted number, in paste order. */
  rows: BulkRowView[];
  /** The rows in the current filter and sort. */
  visible: BulkRowView[];
  /** What the filter names ("Received", a facet), or undefined for every number. */
  filterLabel: string | undefined;
  counts: { total: number; checking: number; nowhere: number; found: number };
  pinpoint: (row: BulkRowView) => void;
  openBucket: (bucket: NavLocateBucket, entry: BulkEntry) => void;
  openRecord: (entry: BulkEntry) => void;
  remove: (entry: BulkEntry) => void;
  recheck: (entry: BulkEntry) => void;
  copyOne: (entry: BulkEntry) => void;
  copyShown: () => void;
}

/**
 * Everything both list surfaces (the bar's panel, the full screen) read and
 * do over ONE held list: rows in the current filter + sort, each row's
 * buckets (on screen / elsewhere), the counts, and the verbs — pinpoint,
 * open a bucket or a record, copy, recheck, remove. `onLeave` runs before a
 * verb navigates away (the surface closes first).
 */
export function useBulkListView({
  list,
  find: pageFind,
  sort,
  onLeave,
}: {
  list: BulkList;
  /** The page list's Find; absent (the everywhere face) = the desk store at this path. */
  find?: PageFind;
  sort: BulkListSort;
  onLeave: () => void;
}): BulkListView {
  const pathname = usePathname() || '/';
  const [deskFind, setDeskFind] = useDeskSearch(pathname);
  const find = pageFind ? pageFind.value : deskFind;
  const setFind = pageFind ? pageFind.set : setDeskFind;
  const router = useRouter();
  const searchParams = useSearchParams();

  const bucketById = useMemo(() => new Map(list.buckets.map((bucket) => [bucket.id, bucket])), [list.buckets]);
  const bucketRank = useMemo(() => new Map(list.buckets.map((bucket, index) => [bucket.id, index])), [list.buckets]);
  // A bucket is "here" when its href is the list on screen. A verdict bucket
  // (no href) is the page's own list under the paste — never another
  // section's, and never on the everywhere face, which has no page list.
  const currentIds = useMemo(() => {
    const current = new URLSearchParams(searchParams?.toString() ?? '');
    const viewKeys = new Set<string>();
    for (const bucket of list.buckets) {
      if (bucket.href) for (const key of new URL(bucket.href, 'http://local').searchParams.keys()) viewKeys.add(key);
    }
    return new Set(
      list.buckets
        .filter((bucket) =>
          bucket.href ? isCurrentView(bucket.href, pathname, current, viewKeys) : !bucket.id.includes(':'),
        )
        .map((bucket) => bucket.id),
    );
  }, [list.buckets, pathname, searchParams]);

  const rows = useMemo(
    () =>
      list.entries.map((entry, index): BulkRowView => {
        const buckets = entry.buckets.flatMap((id) => {
          const bucket = bucketById.get(id);
          return bucket ? [{ bucket, current: currentIds.has(id), elsewhere: isElsewhereBucket(bucket, list.scope) }] : [];
        });
        const primaryId = primaryBucketId(buckets.map((b) => b.bucket.id), list.scope);
        return { entry, position: index + 1, buckets, primary: buckets.find((b) => b.bucket.id === primaryId) };
      }),
    [list.entries, list.scope, bucketById, currentIds],
  );

  const visible = useMemo(() => {
    // A facet names the reason inside the status; it keeps its own numbers
    // (a found-nowhere number wears its reason with no bucket).
    const kept = rows.filter((row) =>
      list.facet
        ? row.entry.facet?.id === list.facet
        : list.status === NAV_LOCATE_NOWHERE
          ? !row.entry.pending && row.entry.buckets.length === 0
          : list.status
            ? row.entry.buckets.includes(list.status)
            : true,
    );
    return sortRows(kept, sort, bucketRank);
  }, [rows, list.status, list.facet, sort, bucketRank]);

  const copy = async (text: string, what: string) => {
    if (await copyToClipboard(text)) toast.success(`Copied ${what}`);
  };
  // The bucket's list, narrowed to this number by its Find. A push, so Back
  // returns to the pasted list.
  const openBucket = (bucket: NavLocateBucket, entry: BulkEntry) => {
    if (!bucket.href) return;
    onLeave();
    if (pageFind && !isElsewhereBucket(bucket, list.scope)) {
      pageFind.open(bucket.href, entry.ref);
      return;
    }
    setDeskSearch(new URL(bucket.href, 'http://local').pathname, entry.ref);
    router.push(bucket.href, { scroll: false });
  };
  // The record's details, opened the way its triage card opens them (`recordDetailsNavigation`):
  // in place when its desk's list is the page on screen, else there — and Esc comes back here.
  const openRecord = (entry: BulkEntry) => {
    if (!entry.recordHref) return;
    onLeave();
    const next = recordDetailsNavigation(entry.recordHref, { pathname, search: searchParams?.toString() ?? '' });
    if (next.mode === 'replace') router.replace(next.href, { scroll: false });
    else router.push(next.href, { scroll: false });
  };
  // Enter: the number's details (its card's open). A number with no record: Find
  // narrows the list here when it is on screen, else its list elsewhere.
  const pinpoint = (row: BulkRowView) => {
    if (row.entry.recordHref) {
      openRecord(row.entry);
      return;
    }
    const away = row.buckets.find((b) => b.bucket.href);
    if (row.buckets.some((b) => b.current) || !away) setFind(find === row.entry.ref ? '' : row.entry.ref);
    else openBucket(away.bucket, row.entry);
  };
  // A pinpointed number that leaves the list must not keep narrowing the ledger to nothing.
  const remove = (entry: BulkEntry) => {
    if (find === entry.ref) setFind('');
    list.remove(entry.ref);
  };
  const recheck = (entry: BulkEntry) => {
    list.recheck(entry.ref);
    toast.message(`Checking ${entry.ref} again`);
  };

  const facetLabel = list.facet ? list.entries.find((entry) => entry.facet?.id === list.facet)?.facet?.label : undefined;
  const checking = list.entries.filter((entry) => entry.pending).length;
  const nowhere = list.entries.filter((entry) => !entry.pending && entry.buckets.length === 0).length;

  return {
    find,
    rows,
    visible,
    /** What the filter names ("Received", a facet), or undefined for every number. */
    filterLabel:
      facetLabel ??
      (list.status === NAV_LOCATE_NOWHERE ? 'Not found' : list.status ? bucketById.get(list.status)?.label : undefined),
    counts: { total: list.entries.length, checking, nowhere, found: list.entries.length - checking - nowhere },
    pinpoint,
    openBucket,
    openRecord,
    remove,
    recheck,
    copyOne: (entry: BulkEntry) => void copy(entry.ref, entry.ref),
    copyShown: () => void copy(visible.map((row) => row.entry.ref).join('\n'), `${visible.length} numbers`),
  };
}

