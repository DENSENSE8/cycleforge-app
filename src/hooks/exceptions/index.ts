'use client';

/**
 * Exceptions hub — data + resolve hooks, shared by the desk (`/exceptions`)
 * and the phone (`/m/exceptions`). Every resolve posts to the EXISTING write
 * the lane surfaces already use (see the input types in
 * `@/lib/exceptions/facts`) and, on success, invalidates the hub list, every
 * open record and the nav facet counts. Callers own their toasts.
 */

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useOrderPaperworkActions } from '@/lib/orders/order-paperwork-client';
import type {
  BinsResolveInput,
  ClaimResolveInput,
  ExceptionRecordResponse,
  FbmResolveInput,
  LabelsResolveInput,
  PaperworkResolveInput,
  PairsResolveInput,
  ShortResolveInput,
  TrackingResolveInput,
  UnfoundResolveInput,
} from '@/lib/exceptions/facts';
import {
  EXCEPTION_KIND_SPEC,
  parseExceptionRowKey,
  type ExceptionListParams,
  type ExceptionListResponse,
} from '@/lib/exceptions/types';

/** Root of every hub query (list pages and records). */
export const exceptionsQueryKey = ['exceptions'] as const;

export function exceptionsListQueryKey(params: ExceptionListParams) {
  return [...exceptionsQueryKey, 'list', params] as const;
}

export function exceptionRecordQueryKey(key: string | null) {
  return [...exceptionsQueryKey, 'record', key] as const;
}

/** A failed hub / resolve request, carrying its HTTP status (404 = resolved or gone). */
export class ExceptionRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ExceptionRequestError';
  }
}

/** Throws the server's own words on any failure shape the reused routes return. */
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: init?.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false || data.success === false) {
    const error = data.error as { message?: string } | string | undefined;
    const message = typeof error === 'string' ? error : error?.message;
    throw new ExceptionRequestError(message || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

function postJson<T = unknown>(url: string, body: unknown, method = 'POST'): Promise<T> {
  return requestJson<T>(url, { method, body: JSON.stringify(body) });
}

function listUrl(params: ExceptionListParams): string {
  const qs = new URLSearchParams();
  if (params.domain) qs.set('domain', params.domain);
  if (params.kind) qs.set('kind', params.kind);
  if (params.q?.trim()) qs.set('q', params.q.trim());
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  const query = qs.toString();
  return query ? `/api/exceptions?${query}` : '/api/exceptions';
}

export function useExceptions(params: ExceptionListParams) {
  return useQuery({
    queryKey: exceptionsListQueryKey(params),
    queryFn: () => requestJson<ExceptionListResponse>(listUrl(params)),
    // A kind / search switch keeps the last rows + counts on screen until the new page lands.
    placeholderData: keepPreviousData,
  });
}

/**
 * Per-kind counts only (`?count_only=1` — no row reads): for `kind`, else
 * `domain`'s kinds, else every kind the caller may see. For badges.
 */
export function useExceptionCounts(params: Pick<ExceptionListParams, 'domain' | 'kind' | 'q'> = {}) {
  return useQuery({
    queryKey: [...exceptionsQueryKey, 'counts', params] as const,
    queryFn: async () => {
      const base = listUrl(params);
      const url = `${base}${base.includes('?') ? '&' : '?'}count_only=1`;
      return (await requestJson<ExceptionListResponse>(url)).counts;
    },
    placeholderData: keepPreviousData,
  });
}

/** Load-more pages over the same list (`nextCursor` drives `hasNextPage`). */
export function useExceptionsInfinite(params: Omit<ExceptionListParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: [...exceptionsQueryKey, 'infinite', params] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => requestJson<ExceptionListResponse>(listUrl({ ...params, cursor: pageParam ?? undefined })),
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useException(key: string | null) {
  return useQuery({
    queryKey: exceptionRecordQueryKey(key),
    enabled: key != null && key !== '',
    queryFn: () => requestJson<ExceptionRecordResponse>(`/api/exceptions/${encodeURIComponent(key ?? '')}`),
    // 404 = resolved / gone and 403 = not yours: final answers, never retried.
    retry: (failures, error) =>
      !(error instanceof ExceptionRequestError && (error.status === 404 || error.status === 403)) && failures < 1,
  });
}

async function invalidateExceptions(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: exceptionsQueryKey }),
    queryClient.invalidateQueries({ queryKey: ['nav-facets'] }),
  ]);
}

/** Every resolve also takes the exception its write clears outright (its row key), when it does. */
export type ClearsException = { clears?: string };

/** What an optimistic clear replaced, so a failed write can put it back. */
type ClearSnapshot = ReadonlyArray<readonly [QueryKey, unknown]>;

/** A list page without the cleared row; its kind's count drops by one when the row was on it. */
function dropRow(page: ExceptionListResponse, key: string, kind: string, recount: boolean): ExceptionListResponse {
  const rows = page.rows.filter((row) => row.key !== key);
  if (!recount) return rows.length === page.rows.length ? page : { ...page, rows };
  const counts = { ...page.counts } as Record<string, number | undefined>;
  if (counts[kind] !== undefined) counts[kind] = Math.max(0, (counts[kind] ?? 0) - 1);
  return { ...page, rows, counts: counts as ExceptionListResponse['counts'] };
}

/**
 * Clear one exception NOW (owner 2026-09-29: acknowledging must be
 * immediate): its card leaves every loaded list, its kind's counts and the
 * sidebar's view / mode counts drop by one, and its open record reads
 * "Resolved". The server read that follows confirms it in the background.
 */
async function clearExceptionNow(queryClient: QueryClient, key: string): Promise<ClearSnapshot> {
  const parsed = parseExceptionRowKey(key);
  if (!parsed) return [];
  const { kind } = parsed;
  const domain = EXCEPTION_KIND_SPEC[kind].domain;
  await Promise.all([
    queryClient.cancelQueries({ queryKey: exceptionsQueryKey }),
    queryClient.cancelQueries({ queryKey: ['nav-facets'] }),
  ]);
  const snapshot: Array<readonly [QueryKey, unknown]> = [];
  const keep = (queryKey: QueryKey, data: unknown) => snapshot.push([queryKey, data] as const);

  for (const [queryKey, data] of queryClient.getQueriesData<InfiniteData<ExceptionListResponse>>({ queryKey: [...exceptionsQueryKey, 'infinite'] })) {
    if (!data || !data.pages.some((page) => page.rows.some((row) => row.key === key))) continue;
    keep(queryKey, data);
    queryClient.setQueryData(queryKey, { ...data, pages: data.pages.map((page, index) => dropRow(page, key, kind, index === 0)) });
  }
  for (const [queryKey, data] of queryClient.getQueriesData<ExceptionListResponse>({ queryKey: [...exceptionsQueryKey, 'list'] })) {
    if (!data || !data.rows.some((row) => row.key === key)) continue;
    keep(queryKey, data);
    queryClient.setQueryData(queryKey, dropRow(data, key, kind, true));
  }
  // Every exception count lives under the global Exceptions page.
  const facetContexts = new Set([`exceptions.${kind}`, `exceptions.${domain}`, 'exceptions']);
  for (const [queryKey, data] of queryClient.getQueriesData<{ total?: number }>({ queryKey: ['nav-facets'] })) {
    if (!data || typeof data.total !== 'number' || !facetContexts.has(String(queryKey[1]))) continue;
    keep(queryKey, data);
    queryClient.setQueryData(queryKey, { ...data, total: Math.max(0, data.total - 1) });
  }
  const recordKey = exceptionRecordQueryKey(key);
  keep(recordKey, queryClient.getQueryData(recordKey));
  // null = no record: the open pane says "Resolved" at once.
  queryClient.setQueryData(recordKey, null);
  return snapshot;
}

/**
 * One resolve mutation: run `write`; a write that `clears` its exception
 * clears it before the server answers (rolled back if the write fails). The
 * hub re-read runs in the BACKGROUND — the button is done when the write is,
 * never waiting on every source's list and count to come back.
 */
function useResolveMutation<Input>(write: (input: Input) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, Input & ClearsException, ClearSnapshot>({
    mutationFn: write,
    onMutate: (input) => (input.clears ? clearExceptionNow(queryClient, input.clears) : []),
    onError: (_error, _input, snapshot) => {
      for (const [queryKey, data] of snapshot ?? []) queryClient.setQueryData(queryKey, data);
    },
    onSuccess: () => {
      void invalidateExceptions(queryClient);
    },
  });
}

function patchOrderFields(orderId: number, fields: Record<string, unknown> | undefined) {
  return fields && Object.keys(fields).length > 0 ? postJson(`/api/orders/${orderId}`, fields, 'PATCH') : null;
}

/** Line 1's team note on an order-backed exception → the order's notes trail (the Allocate card's writer, `/api/orders/[id]/notes`). */
export function useExceptionOrderNote() {
  return useResolveMutation<{ orderId: number; noteText: string }>(({ orderId, noteText }) =>
    postJson(`/api/orders/${orderId}/notes`, { noteText }),
  );
}

export function useResolveFbmException() {
  return useResolveMutation<FbmResolveInput>((input) =>
    input.action === 'update-order'
      ? postJson(`/api/orders/${input.orderId}`, input.patch, 'PATCH')
      : postJson(`/api/orders/${input.orderId}/buyer-note/ack`, {}),
  );
}

export function useResolvePairsException() {
  return useResolveMutation<PairsResolveInput>(async (input) => {
    if (input.action === 'merge-placeholder') {
      return postJson('/api/sku-catalog/provisional/merge', {
        provisionalSku: input.provisionalSku,
        targetSku: input.targetSku,
      });
    }
    await patchOrderFields(input.orderId, input.fields);
    let skuCatalogId: number;
    if (input.action === 'create-and-pair-order') {
      const created = await postJson<{ catalog?: { id?: number } }>('/api/sku-catalog', {
        sku: input.sku,
        productTitle: input.productTitle,
      });
      skuCatalogId = Number(created.catalog?.id);
      if (!Number.isFinite(skuCatalogId) || skuCatalogId <= 0) throw new Error('Catalog item was created without an id.');
    } else {
      skuCatalogId = input.skuCatalogId;
    }
    return postJson('/api/sku-catalog/pair', { skuCatalogId, itemNumber: input.itemNumber, platform: input.platform });
  });
}

export function useResolvePaperworkException() {
  return useResolveMutation<PaperworkResolveInput>((input) => {
    if (input.action === 'docs-not-required') {
      return postJson(`/api/orders/${input.orderId}/cage-release`, { action: 'docs-not-required', value: input.value });
    }
    if (input.action === 'link-label') {
      return postJson(`/api/orders/${input.orderId}/labels`, {
        shipstationShipmentId: input.shipstationShipmentId,
        purpose: input.purpose,
        clientEventId: input.clientEventId,
      });
    }
    return postJson(`/api/orders/${input.orderId}/manuals`, { manualId: input.manualId, pairTo: input.pairTo });
  });
}

/**
 * The PaperworkEditor's own document / manual writes (upload, replace,
 * fetch from the platform, pair, …) for one order, refreshing the hub after
 * each — the paperwork resolver's file controls.
 */
export function usePaperworkExceptionActions(orderId: number, orderRef: string) {
  const queryClient = useQueryClient();
  return useOrderPaperworkActions(orderId, orderRef, () => void invalidateExceptions(queryClient));
}

export function useResolveLabelsException() {
  return useResolveMutation<LabelsResolveInput>((input) =>
    input.action === 'retry'
      ? postJson(`/api/v1/label-ingestions/${input.ingestionId}/retry`, {})
      : postJson(`/api/orders/${input.orderId}/labels`, {
          shipstationShipmentId: input.shipstationShipmentId,
          purpose: input.purpose,
          clientEventId: input.clientEventId,
        }),
  );
}

export function useResolveBinsException() {
  return useResolveMutation<BinsResolveInput>((input) =>
    postJson(`/api/inventory/alerts/${input.alertId}/ack`, input.note ? { note: input.note } : {}),
  );
}

export function useResolveTrackingException() {
  return useResolveMutation<TrackingResolveInput>((input) =>
    input.action === 'refresh'
      ? postJson(`/api/tracking-exceptions/${input.id}/refresh`, {})
      : postJson(`/api/tracking-exceptions/${input.id}`, input.patch, 'PATCH'),
  );
}

export function useResolveClaimException() {
  return useResolveMutation<ClaimResolveInput>((input) =>
    postJson(`/api/receiving/${input.receivingId}/claims/resolve`, { ticket: input.ticket }),
  );
}

export function useResolveShortException() {
  return useResolveMutation<ShortResolveInput>((input) => {
    if (input.action === 'set-quantity') {
      const body: Record<string, unknown> = { id: input.lineId };
      if (input.quantityReceived !== undefined) body.quantity_received = input.quantityReceived;
      if (input.quantityExpected !== undefined) body.quantity_expected = input.quantityExpected;
      return postJson('/api/receiving-lines', body, 'PATCH');
    }
    return postJson('/api/receiving/zendesk-claim', {
      receivingId: input.receivingId,
      lineId: input.lineId,
      claimType: input.claimType,
      reason: input.reason,
    });
  });
}

export function useResolveUnfoundException() {
  return useResolveMutation<UnfoundResolveInput>((input) =>
    postJson('/api/receiving/relink', {
      receiving_id: input.receivingId,
      zoho_purchaseorder_id: input.zohoPurchaseorderId,
      zoho_purchaseorder_number: input.zohoPurchaseorderNumber ?? null,
      scope: 'carton',
    }),
  );
}
