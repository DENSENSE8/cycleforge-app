'use client';

/**
 * Labels & docs › Orders — the list's data and its check-set.
 *
 * `useOrderPackets`: the sidebar's params (`status` · `gap` · `channel` ·
 * `sort` · `q`, as the sidebar writes them) plus the page → one
 * `/api/shipping/label-intake/orders` read, refetched every 15 s; any filter
 * change starts on page 1. `useOrderChecks`: the checked orders in the order
 * they were checked, each kept as last seen (so a print reaches orders off
 * this page), on the shared `TriageSelectionPort` grammar — Shift-range,
 * select visible, clear.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import {
  ORDER_PACKET_CHANNEL_PARAM,
  ORDER_PACKET_GAP_PARAM,
  ORDER_PACKET_GAPS,
  ORDER_PACKET_PAGE_SIZE,
  ORDER_PACKET_QUERY_PARAM,
  ORDER_PACKET_SORT_PARAM,
  ORDER_PACKET_SORTS,
  ORDER_PACKET_STATUS_PARAM,
  ORDER_PACKET_STATUSES,
  type OrderPacket,
  type OrderPacketQuery,
} from '@/lib/label-prints/order-packet-contracts';
import { fetchOrderPackets, orderPacketsKey } from '@/lib/label-prints/order-packets-client';

/** A comma list param's distinct values (the encoding the sidebar's multi facets write). */
function listParam(raw: string | null): string[] {
  return [...new Set((raw ?? '').split(',').map((value) => value.trim()).filter(Boolean))];
}

/** The URL's Orders question (the sidebar writes it), minus paging; anything malformed reads as unset. */
export function readOrderPacketQuery(params: Pick<URLSearchParams, 'get'>): Omit<OrderPacketQuery, 'limit' | 'offset'> {
  const status = ORDER_PACKET_STATUSES.find((value) => value === params.get(ORDER_PACKET_STATUS_PARAM));
  const sort = ORDER_PACKET_SORTS.find((value) => value === params.get(ORDER_PACKET_SORT_PARAM));
  const gaps = listParam(params.get(ORDER_PACKET_GAP_PARAM));
  const gap = ORDER_PACKET_GAPS.filter((value) => gaps.includes(value));
  const channel = listParam(params.get(ORDER_PACKET_CHANNEL_PARAM));
  const q = params.get(ORDER_PACKET_QUERY_PARAM)?.trim();
  return {
    ...(status ? { status } : {}),
    ...(sort ? { sort } : {}),
    ...(gap.length > 0 ? { gap } : {}),
    ...(channel.length > 0 ? { channel } : {}),
    ...(q ? { q } : {}),
  };
}

export function useOrderPackets(params: Pick<URLSearchParams, 'get'>, page: { pageIndex: number; setPageIndex: (index: number) => void }) {
  const { pageIndex, setPageIndex } = page;
  const filters = useMemo(() => readOrderPacketQuery(params), [params]);
  const scopeKey = JSON.stringify(filters);
  // A narrower list from page 3 would land past its end: any filter change starts on page 1.
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    if (pageIndex > 0) setPageIndex(0);
  }, [scopeKey, pageIndex, setPageIndex]);
  const query = useMemo<OrderPacketQuery>(
    () => ({ ...filters, limit: ORDER_PACKET_PAGE_SIZE, offset: pageIndex * ORDER_PACKET_PAGE_SIZE }),
    [filters, pageIndex],
  );
  const read = useQuery({
    queryKey: orderPacketsKey(query),
    queryFn: () => fetchOrderPackets(query),
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
    pageCount: Math.max(1, Math.ceil(total / ORDER_PACKET_PAGE_SIZE)),
    pageSize: ORDER_PACKET_PAGE_SIZE,
    loading: read.isPending,
    fetching: read.isFetching,
    error: read.error,
  };
}

export function useOrderChecks(rows: readonly OrderPacket[]) {
  const [checked, setChecked] = useState<ReadonlyMap<number, OrderPacket>>(() => new Map());
  const anchorId = useRef<number | null>(null);
  const visibleIds = useRef<readonly number[]>([]);
  const byId = useMemo(() => new Map(rows.map((packet) => [packet.orderId, packet])), [rows]);
  const addPackets = useCallback((packets: readonly OrderPacket[]) => {
    setChecked((current) => {
      const next = new Map(current);
      for (const packet of packets) next.set(packet.orderId, packet);
      return next;
    });
  }, []);
  const removeIds = useCallback((ids: readonly number[]) => {
    setChecked((current) => {
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);
  const selection = useMemo<TriageSelectionPort<OrderPacket>>(
    () => ({
      ids: new Set(checked.keys()),
      toggle: (packet, event) => {
        const ids = rows.map((row) => row.orderId);
        const from = event.shiftKey && anchorId.current != null ? ids.indexOf(anchorId.current) : -1;
        const to = ids.indexOf(packet.orderId);
        if (from >= 0 && to >= 0) {
          addPackets(rows.slice(Math.min(from, to), Math.max(from, to) + 1));
          return;
        }
        anchorId.current = packet.orderId;
        if (checked.has(packet.orderId)) removeIds([packet.orderId]);
        else addPackets([packet]);
      },
      toggleGroup: (ids, on) => {
        if (on) addPackets(ids.flatMap((id) => byId.get(id) ?? []));
        else removeIds(ids);
      },
      setAll: (on) => {
        if (on) addPackets(visibleIds.current.flatMap((id) => byId.get(id) ?? []));
        else setChecked(new Map());
      },
      publishVisible: (ids) => {
        visibleIds.current = ids;
      },
    }),
    [checked, rows, byId, addPackets, removeIds],
  );
  /** The checked orders, freshest read first: this page's copy when it is on it, else as last seen. */
  const checkedPackets = useMemo(() => [...checked.values()].map((packet) => byId.get(packet.orderId) ?? packet), [checked, byId]);
  return { selection, checkedPackets };
}
