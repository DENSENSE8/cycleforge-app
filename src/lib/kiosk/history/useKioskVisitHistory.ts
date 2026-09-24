'use client';

/**
 * The History rail's query state — search, pages, and the selected visit.
 *
 * Callers: `KioskHistoryPane`. Affected API: GET `/api/kiosk/visit` (through
 * `kiosk-history-client`). Schemas: none.
 *
 * One hook owns paging AND search because they are the same cursor: typing a
 * new query must throw the old pages away, or "load more" appends the
 * unfiltered tail underneath filtered rows. Keeping them in two hooks is how
 * that bug is written.
 *
 * Every fetch carries an `AbortController` and a request sequence number. A
 * counter operator types faster than a query returns, and without both an
 * earlier response can land last and repaint the rail with results for a
 * prefix of what is now in the box.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchKioskVisits,
  type KioskVisitKindFilter,
  type KioskVisitRow,
} from './kiosk-history-client';

/** Keystroke settle before a search hits the wire. */
const SEARCH_DEBOUNCE_MS = 250;

export interface KioskVisitHistoryState {
  rows: KioskVisitRow[];
  loading: boolean;
  /** True while a "load more" is in flight — the rail keeps its rows. */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  /**
   * The strict search found nothing and the rows below are NEAR-name matches.
   * The rail prints this; an operator who cannot tell the two apart reprints
   * the wrong customer's ticket.
   */
  relaxed: boolean;
  /** What was relaxed — the term as typed. Null unless `relaxed`. */
  relaxedTerm: string | null;
  search: string;
  setSearch: (next: string) => void;
  /** All · Sales · Repair service — the rail's routing. */
  kind: KioskVisitKindFilter;
  setKind: (next: KioskVisitKindFilter) => void;
  loadMore: () => void;
  /** Re-run the current query from the first page (after an edit). */
  refresh: () => void;
}

export function useKioskVisitHistory(): KioskVisitHistoryState {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KioskVisitKindFilter>('all');
  const [rows, setRows] = useState<KioskVisitRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relaxed, setRelaxed] = useState(false);
  const [relaxedTerm, setRelaxedTerm] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * The query the current `cursor` was cut from. "Load more" must compare
   * against THIS, not the live box: between a keystroke and the debounce the
   * search has already changed while the cursor still belongs to the old
   * query, and appending that page puts unfiltered rows under filtered ones.
   */
  const cursorQuery = useRef<{ search: string; kind: KioskVisitKindFilter }>({ search: '', kind: 'all' });

  // First page: debounced on the query, re-armed by `refresh()`.
  useEffect(() => {
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const page = await fetchKioskVisits({ q: search, kind, signal: controller.signal });
        if (seq !== requestSeq.current) return;
        setRows(page.visits);
        setCursor(page.nextCursor);
        setRelaxed(page.relaxed);
        setRelaxedTerm(page.relaxedTerm);
        cursorQuery.current = { search, kind };
        setError(null);
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : 'Could not load visit history.');
        setRows([]);
        setCursor(null);
        setRelaxed(false);
        setRelaxedTerm(null);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, search ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, kind, reloadNonce]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    if (cursorQuery.current.search !== search || cursorQuery.current.kind !== kind) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const page = await fetchKioskVisits({ q: search, kind, cursor });
      // A query that changed mid-fetch invalidates this tail entirely.
      if (seq !== requestSeq.current) return;
      setRows((prev) => [...prev, ...page.visits]);
      setCursor(page.nextCursor);
      // The cursor carries the relaxation, so the tail is the same kind of
      // match set as the head — but read it back rather than assuming it.
      setRelaxed(page.relaxed);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'Could not load more visits.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, kind, loadingMore, search]);

  return {
    rows,
    loading,
    loadingMore,
    error,
    hasMore: cursor !== null,
    relaxed,
    relaxedTerm,
    search,
    setSearch,
    kind,
    setKind,
    loadMore,
    refresh: () => setReloadNonce((n) => n + 1),
  };
}
