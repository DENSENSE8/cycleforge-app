'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { NAV_LOCATE_NOWHERE, type NavLocateBucket, type NavLocateEntry, type NavLocateResponse, type NavLocateScope } from '@/lib/nav/context/schema';
import { fetchNavLocate } from '@/lib/nav/context/http-client';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import { parseRefInParam, parseRefList, serializeRefIn, type RefSelection } from '@/lib/receiving/reconcile';
import { recordRecentList } from '@/lib/nav/locate/recent-lists';
import { toast } from '@/lib/toast';

/** One pasted number: the locator's answer, or a placeholder while it is asked. */
export interface BulkEntry extends NavLocateEntry {
  /** Not answered yet — the locator is still being asked. */
  pending: boolean;
}

/** The pasted list, where each number lives, and the verbs over it. */
export interface BulkList {
  scope: NavLocateScope;
  selection: RefSelection;
  response: NavLocateResponse | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** One per pasted number, in paste order. */
  entries: BulkEntry[];
  /** The locator's buckets, in its order — counts are pasted numbers found in each. */
  buckets: NavLocateBucket[];
  /** The bucket filter (a bucket id, or {@link NAV_LOCATE_NOWHERE}), or null for every number. */
  status: string | null;
  setStatus: (status: string | null) => void;
  /** The facet filter inside {@link status} (an entry's `facet.id`), or null. */
  facet: string | null;
  /** A paste of 2+ numbers → the list. False for a single number (it stays a Find). */
  paste: (text: string) => boolean;
  remove: (ref: string) => void;
  /** Replace one number with whatever was typed (a comma list expands in place). */
  replaceRef: (ref: string, text: string) => void;
  /** Ask the locator again for one number alone; the rest keep their answers. */
  recheck: (ref: string) => void;
  clear: () => void;
  /** Numbers the paste carried more than once (ref → times pasted); the list itself keeps one. */
  repeats: ReadonlyMap<string, number>;
}

const NO_REPEATS: ReadonlyMap<string, number> = new Map();

/**
 * How many times a paste carried each number, for the ones it carried more
 * than once. Each separated piece (newline / comma / semicolon / tab) is read
 * by the SAME parse as the list, so a number counts under the key it dedupes by.
 */
export function pasteRepeats(text: string): ReadonlyMap<string, number> {
  const byKey = new Map<string, { ref: string; times: number }>();
  for (const piece of text.split(/[\n,;\t]+/)) {
    const one = parseRefList(piece);
    one.keys.forEach((key, index) => {
      const seen = byKey.get(key);
      if (seen) seen.times += 1;
      else byKey.set(key, { ref: one.refs[index]!, times: 1 });
    });
  }
  const repeats = new Map<string, number>();
  for (const { ref, times } of byKey.values()) if (times > 1) repeats.set(ref, times);
  return repeats.size > 0 ? repeats : NO_REPEATS;
}

/** Bucket counts are the pasted numbers in each — recounted after answers merge. */
function recount(buckets: readonly NavLocateBucket[], entries: readonly NavLocateEntry[]): NavLocateBucket[] {
  return buckets.map((bucket) => ({ ...bucket, count: entries.filter((entry) => entry.buckets.includes(bucket.id)).length }));
}

/** What one located list last answered — reused when the list is edited, not when it is refreshed. */
interface LocatedMemo {
  scope: NavLocateScope;
  refsKey: string;
  buckets: NavLocateBucket[];
  entries: Map<string, NavLocateEntry>;
  /** Set by a recheck: the next ask reuses every other answer. */
  partial: boolean;
}

/**
 * `GET /api/nav/locate` for a pasted list. An edit (remove, replace) or a
 * recheck asks only the numbers without an answer in hand; a refresh of the
 * same list asks them all.
 */
export function useLocatedList(scope: NavLocateScope, refs: readonly string[]) {
  const staffKey = useNavStaffKey();
  const queryClient = useQueryClient();
  const known = useRef<LocatedMemo | null>(null);
  const refsKey = refs.join(',');
  const queryKey = useMemo(() => ['nav-locate-list', staffKey, scope, refsKey] as const, [staffKey, scope, refsKey]);

  const query = useQuery({
    queryKey,
    enabled: refs.length > 0,
    // A list is re-asked when edited, rechecked or retried — not per focus.
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<NavLocateResponse> => {
      const last = known.current;
      const memo = last && last.scope === scope && (last.refsKey !== refsKey || last.partial) ? last : null;
      const answers = new Map<string, NavLocateEntry>();
      for (const ref of refs) {
        const hit = memo?.entries.get(ref);
        if (hit) answers.set(ref, hit);
      }
      let buckets = memo?.buckets ?? [];
      let truncated = 0;
      const ask = refs.filter((ref) => !answers.has(ref));
      if (ask.length > 0) {
        const answer = await fetchNavLocate(scope, { refs: ask }, signal);
        buckets = answer.buckets;
        truncated = answer.truncated;
        for (const entry of answer.entries) answers.set(entry.ref, entry);
      }
      known.current = { scope, refsKey, buckets, entries: new Map(answers), partial: false };
      const entries = refs.flatMap((ref) => answers.get(ref) ?? []);
      return { locator: scope, buckets: recount(buckets, entries), entries, truncated };
    },
  });

  const recheck = useCallback(
    (ref: string) => {
      const memo = known.current;
      if (memo) {
        memo.entries.delete(ref);
        memo.partial = true;
      }
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
    [queryClient, queryKey],
  );
  return { query, recheck, refetch: () => void query.refetch() };
}

/**
 * The list from its refs + filter, however they are stored (the page URL,
 * component state). `writeRefs` persists the next refs (an empty list also
 * drops the filter).
 */
export function useBulkList(
  scope: NavLocateScope,
  selection: RefSelection,
  rawStatus: string | null,
  rawFacet: string | null,
  writeRefs: (refs: readonly string[]) => void,
  setStatus: (status: string | null) => void,
  /** Repeats carried in from elsewhere (the full list page's URL) until this face pastes its own. */
  seedRepeats: ReadonlyMap<string, number> = NO_REPEATS,
): BulkList {
  const staffKey = useNavStaffKey();
  const [pasted, setPasted] = useState<ReadonlyMap<string, number> | null>(null);
  const located = useLocatedList(scope, selection.refs);
  const response = located.query.data;
  const buckets = useMemo(() => response?.buckets ?? [], [response]);
  const entries = useMemo(() => {
    const answered = new Map((response?.entries ?? []).map((entry) => [entry.ref, entry]));
    return selection.refs.map((ref): BulkEntry => {
      const hit = answered.get(ref);
      return hit
        ? { ...hit, pending: false }
        : { ref, buckets: [], title: null, detail: null, recordHref: null, pending: true };
    });
  }, [response, selection.refs]);
  const repeats = pasted ?? seedRepeats;
  // A filter naming no bucket this locator declares filters nothing; Not found is always a filter.
  const status =
    rawStatus && (rawStatus === NAV_LOCATE_NOWHERE || buckets.some((bucket) => bucket.id === rawStatus)) ? rawStatus : null;
  // A facet only narrows inside a status, and only one some number wears.
  const facet = status && rawFacet && entries.some((entry) => entry.facet?.id === rawFacet) ? rawFacet : null;

  return {
    scope,
    selection,
    response,
    loading: located.query.isFetching,
    error: located.query.error ? located.query.error.message || 'Could not locate the pasted numbers' : null,
    refetch: located.refetch,
    entries,
    buckets,
    status,
    setStatus,
    facet,
    paste: (text: string): boolean => {
      const next = parseRefList(text);
      if (next.refs.length < 2) return false;
      writeRefs(next.refs);
      setPasted(pasteRepeats(text));
      recordRecentList(staffKey, next.refs, scope, window.location.pathname);
      if (next.truncated > 0) toast.message(`Checking the first ${next.refs.length} — ${next.truncated} more were dropped`);
      return true;
    },
    remove: (ref: string) => writeRefs(selection.refs.filter((r) => r !== ref)),
    replaceRef: (ref: string, text: string) => {
      const typed = parseRefList(text).refs;
      const at = selection.refs.indexOf(ref);
      if (at < 0) return;
      const next = [...selection.refs.slice(0, at), ...typed, ...selection.refs.slice(at + 1)];
      writeRefs(parseRefList(next.join('\n')).refs);
    },
    recheck: located.recheck,
    clear: () => {
      writeRefs([]);
      setPasted(NO_REPEATS);
    },
    repeats,
  };
}

/** The list held in component state — a face with no page list (the everywhere face, mobile) has no URL. */
export function useLocalBulkList(scope: NavLocateScope): BulkList {
  const [selection, setSelection] = useState<RefSelection>(() => parseRefInParam(null));
  const [status, setStatus] = useState<string | null>(null);
  const writeRefs = useCallback((refs: readonly string[]) => {
    setSelection(parseRefInParam(serializeRefIn(refs)));
    if (refs.length === 0) setStatus(null);
  }, []);
  return useBulkList(scope, selection, status, null, writeRefs, setStatus);
}
