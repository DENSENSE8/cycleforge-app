import { queryOptions } from '@tanstack/react-query';
import type { CartonInspectorPayload } from '@/components/receiving/inspector/carton-inspector-model';
import { resolveReceivingLinkedOrder } from '@/lib/search/resolve-receiving-linked-order';
import type { ResolvedSearchOrder } from '@/lib/search/resolve-search-order';

const SEARCH_RECEIVING_STALE_MS = 30_000;

export function searchReceivingQueryKey(receivingId: number) {
  return ['search-receiving', receivingId] as const;
}

export function searchReceivingLinkedOrderQueryKey(receivingId: number) {
  return ['search-receiving-linked-order', receivingId] as const;
}

export function searchReceivingQuery(receivingId: number) {
  const enabled = Number.isFinite(receivingId) && receivingId > 0;
  return queryOptions({
    queryKey: searchReceivingQueryKey(receivingId),
    queryFn: async (): Promise<CartonInspectorPayload> => {
      const res = await fetch(`/api/receiving/${receivingId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load carton ${receivingId}`);
      return (await res.json()) as CartonInspectorPayload;
    },
    staleTime: SEARCH_RECEIVING_STALE_MS,
    enabled,
  });
}

export function searchReceivingLinkedOrderQuery(
  receivingId: number,
  payload: CartonInspectorPayload | undefined,
) {
  const enabled =
    Number.isFinite(receivingId) &&
    receivingId > 0 &&
    Boolean(payload?.receiving);
  return queryOptions({
    queryKey: searchReceivingLinkedOrderQueryKey(receivingId),
    queryFn: async (): Promise<ResolvedSearchOrder | null> => {
      if (!payload?.receiving) return null;
      return resolveReceivingLinkedOrder(payload.receiving, payload.lines);
    },
    staleTime: SEARCH_RECEIVING_STALE_MS,
    enabled,
  });
}
