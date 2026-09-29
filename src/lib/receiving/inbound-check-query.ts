'use client';

/**
 * The ONE client read of the Check for a pasted Inbound list — the ledger's
 * status chips, filter and cards share this query key. The `view=reconcile`
 * rows ride the table's own key (`receivingReconcileRowsQuery`): our own
 * receiving lines, which decide every number the ERP had no answer for.
 *
 * An edited list (a number removed anywhere — the ledger, the popout, Back —
 * or one typed over) asks only the numbers no recent list has answered; the
 * rest are reused from the cache and paint at once.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { receivingReconcileRowsQuery, type ReceivingLinesListResponse } from '@/lib/queries/receiving-queries';
import { parseRefInParam, reconcileCheck, rowRefKeys, type ReconEntry, type RefSelection } from '@/lib/receiving/reconcile';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

const CHECK_ENDPOINT = '/api/receiving-lines/incoming/check-zoho-received';

/** How long an answer another list holds may stand in for a fresh ask (the Check's own staleTime). */
const CHECK_FRESH_MS = 5 * 60_000;

/** The receiving-lines reads for pasted lists — every `receivingReconcileRowsQuery` key starts with it. */
const RECONCILE_ROWS_ROOT = receivingReconcileRowsQuery([]).queryKey.slice(0, -1);

interface CheckResponse {
  success?: boolean;
  error?: string;
  received_in_zoho?: CheckZohoReceivedRow[];
  not_received_in_zoho?: CheckZohoReceivedRow[];
  undetermined?: CheckZohoReceivedRow[];
}

async function fetchCheckRows(refs: readonly string[], signal?: AbortSignal): Promise<CheckZohoReceivedRow[]> {
  const res = await fetch(CHECK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackings: refs }),
    signal,
  });
  const data = (await res.json().catch(() => null)) as CheckResponse | null;
  if (!res.ok || !data?.success) throw new Error(data?.error || `Check failed (${res.status})`);
  return [...(data.received_in_zoho ?? []), ...(data.not_received_in_zoho ?? []), ...(data.undetermined ?? [])];
}

/** The Check's cache key for a list — the operator's refs, in paste order. */
const inboundCheckQueryKey = (refs: readonly string[]) => ['inbound-check', refs.join(',')] as const;

/**
 * Answers OTHER recent lists already hold for `keys` (canonical), newest
 * first. Never this list's own entry: refreshing a list asks it again.
 */
function cachedCheckRows(
  queryClient: QueryClient,
  ownRefsKey: string,
  keys: ReadonlySet<string>,
): Map<string, CheckZohoReceivedRow> {
  const now = Date.now();
  const lists = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['inbound-check'] })
    .filter((query) => query.queryKey[1] !== ownRefsKey && query.state.data && now - query.state.dataUpdatedAt < CHECK_FRESH_MS)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const found = new Map<string, CheckZohoReceivedRow>();
  for (const list of lists) {
    for (const row of list.state.data as CheckZohoReceivedRow[]) {
      const key = canonicalizeTrackingKey(row.tracking);
      if (keys.has(key) && !found.has(key)) found.set(key, row);
    }
  }
  return found;
}

/**
 * The lines a recent list read that already cover every one of `keys` — a
 * superset list (the one a number was just removed from), cut to these keys.
 * A capped read may miss lines, so it never stands in.
 */
function cachedLines(queryClient: QueryClient, keys: ReadonlySet<string>): ReceivingLinesListResponse | undefined {
  for (const [queryKey, data] of queryClient.getQueriesData<ReceivingLinesListResponse>({ queryKey: RECONCILE_ROWS_ROOT })) {
    if (!data || Number(data.total ?? 0) > data.receiving_lines.length) continue;
    const listKeys = new Set(parseRefInParam(String(queryKey[queryKey.length - 1] ?? '')).keys);
    if (listKeys.size <= keys.size || ![...keys].every((key) => listKeys.has(key))) continue;
    const kept = data.receiving_lines.filter((line) => rowRefKeys(line).some((key) => keys.has(key)));
    return { ...data, receiving_lines: kept, total: kept.length };
  }
  return undefined;
}

export interface InboundCheck {
  /** One per pasted number, in paste order. Empty while there is no list. */
  entries: ReconEntry[];
  /** Nothing answered yet (the Check and the lines are both still out). */
  loading: boolean;
  /** The Check is being asked (the first answer, a retry, or an edit's new numbers). */
  checking: boolean;
  /** Numbers with an answer — the progress line's count. */
  answered: number;
  error: string | null;
  /** Ask the whole list again — nothing reused. */
  refetch: () => void;
  /** Ask the Check again for one number alone; the rest keep their answers. */
  recheck: (ref: string) => Promise<void>;
  /** The raw Check answer per canonical key (reason, verdict, local, PO status) — a number's record reads it. */
  rowsByKey: ReadonlyMap<string, CheckZohoReceivedRow>;
}

export function useInboundCheck(selection: RefSelection): InboundCheck {
  const queryClient = useQueryClient();
  const refsKey = selection.refs.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryKey = useMemo(() => inboundCheckQueryKey(selection.refs), [refsKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => new Set(selection.keys), [refsKey]);
  /** Set by `refetch`: the next ask reuses nothing. */
  const askAll = useRef(false);

  const query = useQuery<CheckZohoReceivedRow[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const known = askAll.current ? new Map<string, CheckZohoReceivedRow>() : cachedCheckRows(queryClient, refsKey, keys);
      askAll.current = false;
      const ask = selection.refs.filter((_, index) => !known.has(selection.keys[index]));
      const fresh = ask.length > 0 ? await fetchCheckRows(ask, signal) : [];
      return [...known.values(), ...fresh];
    },
    // What recent lists already answered paints at once; only the rest reads "Checking…".
    placeholderData: () => {
      const known = cachedCheckRows(queryClient, refsKey, keys);
      return known.size > 0 ? [...known.values()] : undefined;
    },
    enabled: selection.refs.length > 0,
    // A re-render must never ask again; a list is re-asked when edited, rechecked or retried.
    staleTime: CHECK_FRESH_MS,
  });
  const rows = useQuery({
    ...receivingReconcileRowsQuery(selection.refs),
    placeholderData: () => cachedLines(queryClient, keys),
    enabled: selection.refs.length > 0,
  });
  const entries = useMemo(
    () =>
      selection.refs.length > 0
        ? reconcileCheck(selection, query.data ?? [], rows.data?.receiving_lines ?? [])
        : [],
    // `selection` is rebuilt from the URL each render; its refs are the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refsKey, query.data, rows.data],
  );
  const answered = useMemo(() => entries.filter((entry) => !entry.pending).length, [entries]);

  // One number again: its Check row, and our lines (the tables decide it when the ERP has no answer).
  const recheck = useCallback(
    async (ref: string) => {
      const key = canonicalizeTrackingKey(ref);
      const [fresh] = await Promise.all([
        fetchCheckRows([ref]),
        queryClient.invalidateQueries({ queryKey: receivingReconcileRowsQuery(selection.refs).queryKey, exact: true }),
      ]);
      queryClient.setQueryData<CheckZohoReceivedRow[]>(queryKey, (current = []) => [
        ...current.filter((row) => canonicalizeTrackingKey(row.tracking) !== key),
        ...fresh,
      ]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, queryKey],
  );

  const rowsByKey = useMemo(() => {
    const map = new Map<string, CheckZohoReceivedRow>();
    for (const row of query.data ?? []) map.set(canonicalizeTrackingKey(row.tracking), row);
    return map;
  }, [query.data]);

  const active = selection.refs.length > 0;
  return {
    entries,
    // The verdict needs both reads: before the rows land, a warehouse-only
    // number would flash "No match anywhere".
    loading: active && (query.isPending || rows.isPending),
    checking: active && query.isFetching,
    answered,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => {
      askAll.current = true;
      void query.refetch();
    },
    recheck,
    rowsByKey,
  };
}
