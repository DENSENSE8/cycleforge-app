'use client';

/**
 * Client reads for the import record (`/operations/imports`, `/m/imports`) —
 * one query key per URL so the desk ledger, the run record and the phone
 * screens paint the same payload.
 *
 * The page never parses the sidebar's filters: it forwards the URL's query
 * verbatim and the API (`src/lib/imports/params`) answers what applies to the
 * endpoint (ReadApi convention 2026-09-28).
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  ImportPage,
  ImportRunDetail,
  ImportRunListItem,
  ImportRunRowItem,
} from '@/lib/imports/types';

/** URL params that are page state, never a filter the list API reads. */
const PAGE_STATE_PARAMS = ['view', 'row', 'page', 'back'] as const;

/**
 * What each list does NOT read (handoff §6 "Applies to"). `run` on the runs
 * view names the OPEN run, not a filter. Dropped here so a run record's rows
 * — read while the runs view's sidebar is up — carry only the facts that
 * narrow rows.
 */
const NOT_READ_BY: Readonly<Record<'runs' | 'rows', readonly string[]>> = {
  runs: ['run', 'platform', 'account', 'outcome'],
  rows: ['status', 'staff', 'cronRun'],
};

/** Each list's sort vocabulary; the other view's sort is not this list's. */
const SORTS: Readonly<Record<'runs' | 'rows', readonly string[]>> = {
  runs: ['newest', 'inserted', 'failed'],
  rows: ['newest', 'order'],
};

/** Rows per request unless the list names its own (API default 50, max 200). */
export const IMPORT_PAGE_SIZE = 50;

async function readJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `${what} failed to load (${res.status})`);
  }
  return (await res.json()) as T;
}

/** The sidebar's filters as one list's query string — the URL minus page state and what that list does not read. */
export function importListQuery(
  params: URLSearchParams,
  endpoint: 'runs' | 'rows',
  overrides: Record<string, string | null> = {},
): string {
  const next = new URLSearchParams(params.toString());
  for (const key of [...PAGE_STATE_PARAMS, ...NOT_READ_BY[endpoint]]) next.delete(key);
  const sort = next.get('sort');
  if (sort && !SORTS[endpoint].includes(sort)) next.delete('sort');
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) next.delete(key);
    else next.set(key, value);
  }
  next.sort();
  return next.toString();
}

function pageUrl(endpoint: 'runs' | 'rows', query: string, page: number, pageSize: number): string {
  const params = new URLSearchParams(query);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return `/api/imports/${endpoint}?${params.toString()}`;
}

function nextPage<T>(last: ImportPage<T>): number | undefined {
  return last.page * last.pageSize < last.total ? last.page + 1 : undefined;
}

function useImportPages<T>(endpoint: 'runs' | 'rows', query: string, enabled: boolean, pageSize: number) {
  const result = useInfiniteQuery({
    queryKey: ['imports', endpoint, query, pageSize] as const,
    queryFn: ({ pageParam }) =>
      readJson<ImportPage<T>>(pageUrl(endpoint, query, pageParam, pageSize), endpoint === 'runs' ? 'Import runs' : 'Imported orders'),
    initialPageParam: 1,
    getNextPageParam: nextPage<T>,
    enabled,
    staleTime: 15_000,
  });
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];
  const total = result.data?.pages[0]?.total ?? 0;
  return { ...result, items, total };
}

/** `GET /api/imports/runs` — newest first unless the sidebar sorts it. */
export function useImportRuns(query: string, enabled = true, pageSize = IMPORT_PAGE_SIZE) {
  return useImportPages<ImportRunListItem>('runs', query, enabled, pageSize);
}

/** `GET /api/imports/rows` — `query` carries `run=<id>` for one run's rows. */
export function useImportRows(query: string, enabled = true, pageSize = IMPORT_PAGE_SIZE) {
  return useImportPages<ImportRunRowItem>('rows', query, enabled, pageSize);
}

/** `GET /api/imports/runs/[id]` — the run with its steps. */
export function useImportRun(runId: number | null) {
  return useQuery({
    queryKey: ['imports', 'run', runId ?? 0] as const,
    queryFn: async () =>
      (await readJson<{ ok: true; run: ImportRunDetail }>(`/api/imports/runs/${runId}`, `Run ${runId}`)).run,
    enabled: runId != null && runId > 0,
    staleTime: 15_000,
  });
}

/** A positive integer URL param, else null. */
export function positiveIntParam(raw: string | null | undefined): number | null {
  const value = Number(String(raw ?? '').trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}
