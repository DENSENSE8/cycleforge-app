'use client';

/**
 * Labels & docs › Bulk — the file list's data and its check-set.
 *
 * `usePrintFiles`: the sidebar's params (`q` · `sort` · `printing` · `from` /
 * `to` · `printedFrom` / `printedTo`, as the sidebar writes them) plus the
 * page → one `GET /api/shipping/label-intake/files` read, refetched every
 * 15 s; any filter change starts on page 1. `usePrintFileChecks`: the checked
 * files in the order they were checked, each kept as last seen (so a print
 * reaches files off this page), on the shared `TriageSelectionPort` grammar —
 * Shift-range, select visible, clear.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import {
  PRINT_FILE_PAGE_SIZE,
  PRINT_FILE_PRINTED_FROM_PARAM,
  PRINT_FILE_PRINTED_TO_PARAM,
  PRINT_FILE_QUERY_PARAM,
  PRINT_FILE_SORT_PARAM,
  PRINT_FILE_SORTS,
  PRINT_FILE_STATUS_PARAM,
  PRINT_FILE_STATUSES,
  PRINT_FILE_UPLOADED_FROM_PARAM,
  PRINT_FILE_UPLOADED_TO_PARAM,
  type PrintFileQuery,
  type PrintFileRow,
  type PrintFileSort,
} from '@/lib/label-prints/print-file-contracts';
import { fetchPrintFile, fetchPrintFiles, PRINT_FILES_KEY_ROOT, printFilesKey } from '@/lib/label-prints/print-files-client';
import { isDateKey } from '@/utils/date';

export type PrintFileFilters = Omit<PrintFileQuery, 'limit' | 'offset'> & { sort: PrintFileSort };

/** The URL's file-list question (the sidebar writes it), minus paging; anything malformed reads as unset. */
export function readPrintFileQuery(params: Pick<URLSearchParams, 'get'>): PrintFileFilters {
  const day = (name: string) => {
    const value = params.get(name);
    return value && isDateKey(value) ? value : undefined;
  };
  const printing = PRINT_FILE_STATUSES.find((value) => value === params.get(PRINT_FILE_STATUS_PARAM));
  const from = day(PRINT_FILE_UPLOADED_FROM_PARAM);
  const to = day(PRINT_FILE_UPLOADED_TO_PARAM);
  const printedFrom = day(PRINT_FILE_PRINTED_FROM_PARAM);
  const printedTo = day(PRINT_FILE_PRINTED_TO_PARAM);
  const q = params.get(PRINT_FILE_QUERY_PARAM)?.trim();
  return {
    sort: PRINT_FILE_SORTS.find((value) => value === params.get(PRINT_FILE_SORT_PARAM)) ?? 'newest',
    ...(printing ? { printing } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(printedFrom ? { printedFrom } : {}),
    ...(printedTo ? { printedTo } : {}),
    ...(q ? { q } : {}),
  };
}

/** One file's pages — under the list's root, so every list invalidation re-reads it too. */
export const printFileDetailKey = (id: number) => [...PRINT_FILES_KEY_ROOT, 'file', id] as const;

export function usePrintFileDetail(id: number | null) {
  return useQuery({
    queryKey: printFileDetailKey(id ?? 0),
    queryFn: () => fetchPrintFile(id!),
    enabled: id != null,
  });
}

/** One server page of files, as the list paints it. */
export interface PrintFilePage {
  filters: PrintFileFilters;
  rows: readonly PrintFileRow[];
  total: number;
  /** 1-based. */
  page: number;
  pageCount: number;
  pageSize: number;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
}

export function usePrintFiles(params: Pick<URLSearchParams, 'get'>, page: { pageIndex: number; setPageIndex: (index: number) => void }): PrintFilePage {
  const { pageIndex, setPageIndex } = page;
  const filters = useMemo(() => readPrintFileQuery(params), [params]);
  const scopeKey = JSON.stringify(filters);
  // A narrower list from page 3 would land past its end: any filter change starts on page 1.
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    if (pageIndex > 0) setPageIndex(0);
  }, [scopeKey, pageIndex, setPageIndex]);
  const query = useMemo<PrintFileQuery>(
    () => ({ ...filters, limit: PRINT_FILE_PAGE_SIZE, offset: pageIndex * PRINT_FILE_PAGE_SIZE }),
    [filters, pageIndex],
  );
  const read = useQuery({
    queryKey: printFilesKey(query),
    queryFn: () => fetchPrintFiles(query),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
  const rows = useMemo(() => read.data?.rows ?? [], [read.data]);
  const total = read.data?.total ?? 0;
  return {
    filters,
    rows,
    total,
    page: pageIndex + 1,
    pageCount: Math.max(1, Math.ceil(total / PRINT_FILE_PAGE_SIZE)),
    pageSize: PRINT_FILE_PAGE_SIZE,
    loading: read.isPending,
    fetching: read.isFetching,
    error: read.error,
  };
}

export function usePrintFileChecks(rows: readonly PrintFileRow[]) {
  const [checked, setChecked] = useState<ReadonlyMap<number, PrintFileRow>>(() => new Map());
  const anchorId = useRef<number | null>(null);
  const visibleIds = useRef<readonly number[]>([]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const addRows = useCallback((files: readonly PrintFileRow[]) => {
    setChecked((current) => {
      const next = new Map(current);
      for (const file of files) next.set(file.id, file);
      return next;
    });
  }, []);
  const removeIds = useCallback((ids: readonly number[]) => {
    setChecked((current) => {
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next.size === current.size ? current : next;
    });
  }, []);
  const selection = useMemo<TriageSelectionPort<PrintFileRow>>(
    () => ({
      ids: new Set(checked.keys()),
      toggle: (file, event) => {
        const ids = rows.map((row) => row.id);
        const from = event.shiftKey && anchorId.current != null ? ids.indexOf(anchorId.current) : -1;
        const to = ids.indexOf(file.id);
        if (from >= 0 && to >= 0) {
          addRows(rows.slice(Math.min(from, to), Math.max(from, to) + 1));
          return;
        }
        anchorId.current = file.id;
        if (checked.has(file.id)) removeIds([file.id]);
        else addRows([file]);
      },
      toggleGroup: (ids, on) => {
        if (on) addRows(ids.flatMap((id) => byId.get(id) ?? []));
        else removeIds(ids);
      },
      setAll: (on) => {
        if (on) addRows(visibleIds.current.flatMap((id) => byId.get(id) ?? []));
        else setChecked(new Map());
      },
      publishVisible: (ids) => {
        visibleIds.current = ids;
      },
    }),
    [checked, rows, byId, addRows, removeIds],
  );
  /** The checked files, freshest read first: this page's copy when it is on it, else as last seen. */
  const checkedFiles = useMemo(() => [...checked.values()].map((file) => byId.get(file.id) ?? file), [checked, byId]);
  return { selection, checkedFiles, uncheck: removeIds };
}
