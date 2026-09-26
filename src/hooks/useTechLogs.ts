'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { invalidateTechCounts } from '@/lib/queries/station-cache-patch';
import { toPSTDateKey } from '@/utils/date';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { useAblyChannel } from './useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';

export interface TechRecord {
  id: number;
  source_row_id?: number;
  source_kind?: 'tech_serial' | 'fba_scan' | 'tech_scan';
  tech_serial_id?: number | null;
  order_db_id?: number | null;
  shipment_id?: number | null;
  created_at: string;
  updated_at?: string | null;
  shipping_tracking_number: string;
  tracking_numbers?: string[] | null;
  tracking_number_rows?: Array<{
    shipment_id: number | null;
    tracking: string;
    is_primary: boolean;
  }> | null;
  serial_number: string;
  tested_by: number;
  ship_by_date?: string | null;
  order_id: string | null;
  fnsku?: string | null;
  /** `fba_fnsku_logs.id` for FNSKU tech scans; pairs fba_scan stub with tech_serial row. */
  fnsku_log_id?: number | null;
  item_number?: string | null;
  product_title: string | null;
  quantity?: string | null;
  condition: string | null;
  sku: string | null;
  status?: string | null;
  status_history?: any;
  account_source?: string | null;
  notes?: string | null;
  out_of_stock?: string | null;
  is_out_of_stock?: boolean;
  /** Derived from shipping_tracking_numbers carrier status */
  is_shipped?: boolean;
  shipment_status?: string | null;
  /** True when any `tech_serial_numbers` row for this SAL used `source_sku_id` (SKU_PULL from `sku` table). */
  has_sku_serial_source?: boolean | null;
}

interface UseTechLogsOptions {
  weekOffset?: number;
  weekRange?: { startStr: string; endStr: string };
  /** Maximum rows returned; rolling rails use 25 while the week table keeps its larger window. */
  limit?: number;
  /** When false, skip the fetch (consumer reads from a shared feed instead). */
  enabled?: boolean;
  /** The bench find box, already debounced by `SearchField` (320ms) — no second debounce here, the text just becomes part of the fetch key. */
  search?: string;
}

export type TechLogsScope = number | 'all';

function prependTechRecordToMatchingWeekCaches(
  queryClient: QueryClient,
  techId: TechLogsScope,
  record: TechRecord,
) {
  const createdAt = record.created_at || new Date().toISOString();
  const recordDate = toPSTDateKey(createdAt);
  const recordForCache: TechRecord = {
    ...record,
    created_at: record.created_at || createdAt,
  };

  const queries = queryClient.getQueriesData<TechRecord[]>({
    queryKey: ['tech-logs', techId],
  });
  /** `q: ''` — the FEED caches, the only ones a fresh scan may be spliced into. */
  const feedQueries = queries.filter(
    ([key]) => !String((key[2] as { q?: string } | undefined)?.q ?? '').trim(),
  );

  /** Only one week cache mounted — week bounds can disagree with PST (timezone); always prepend. */
  const singleWeekCache = feedQueries.length === 1;

  for (const [queryKey, prev] of feedQueries) {
    if (!prev || !Array.isArray(prev)) continue;
    const weekPart = queryKey[2] as { weekStart?: string; weekEnd?: string } | undefined;
    const start = String(weekPart?.weekStart ?? '').trim();
    const end = String(weekPart?.weekEnd ?? '').trim();
    if (
      !singleWeekCache
      && recordDate
      && start
      && end
      && (recordDate < start || recordDate > end)
    ) {
      continue;
    }
    if (prev.some((r) => r.id === recordForCache.id)) continue;
    queryClient.setQueryData<TechRecord[]>(queryKey, (old) => {
      if (!old) return old;
      if (old.some((r) => r.id === recordForCache.id)) return old;
      return [recordForCache, ...old];
    });
  }
}

export function useTechLogs(techId: TechLogsScope, options: UseTechLogsOptions = {}) {
  const {
    weekOffset = 0,
    weekRange,
    limit = 1000,
    enabled: enabledOption = true,
    search = '',
  } = options;
  const searchTerm = search.trim();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  // Global per-org station broadcast (tech logs are filtered by techId in the
  // handler) — NOT a per-staff bridge.
  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  const queryKey = [
    'tech-logs',
    techId,
    {
      weekStart: weekRange?.startStr ?? '',
      weekEnd: weekRange?.endStr ?? '',
      limit,
      q: searchTerm,
    },
  ] as const;

  const query = useQuery<TechRecord[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        techId: techId === 'all' ? 'all' : String(techId),
      });
      // A searching fetch sends no page bound: the route drops it so a match
      // outside the newest `limit` scans of the week is still found — the
      // defect this path exists to close.
      if (searchTerm) params.set('q', searchTerm);
      else params.set('limit', String(limit));
      if (weekRange) {
        params.set('weekStart', weekRange.startStr);
        params.set('weekEnd', weekRange.endStr);
      }
      // Avoid browser HTTP cache (API sends max-age=120); stale responses overwrite optimistic prepends.
      const res = await fetch(`/api/tech-logs?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch tech logs');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    // Current week stays fresh for 5 min (matches server 120s TTL + buffer); historical 30 min.
    staleTime: weekOffset === 0 ? 5 * 60 * 1000 : 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: (prev) => prev,
    enabled:
      enabledOption
      && (techId === 'all' || (typeof techId === 'number' && techId > 0)),
  });

  // ── Ably: live row-level updates from any session (mobile or web) ───────── INSERT with row → surgical prepend (avoids a full round-trip).
  useAblyChannel(
    stationChannel,
    'tech-log.changed',
    (msg: any) => {
      const { techId: changedId, action, row } = msg?.data ?? {};
      const matchesScope =
        techId === 'all' || Number(changedId) === techId;
      if (!matchesScope) return;

      if (action === 'insert' && row) {
        prependTechRecordToMatchingWeekCaches(queryClient, techId, row as TechRecord);
      } else if (action === 'insert' || action === 'update' || action === 'delete') {
        // Covers: insert without full row data, updates to existing rows,
        // and deletions (e.g. undo-last) from any client or device.
        queryClient.invalidateQueries({ queryKey: ['tech-logs', techId] });
      }
      // Keep the lightweight lane/legend counts in step without a row download
      // (no-op until a counts query is mounted). station-table-unification §7.4.
      invalidateTechCounts(queryClient);
    },
    !!stationChannel,
  );

  // ── Local surgical insert (same-tab tracking scans via CustomEvent) ────────
  // Fired by scan-tracking handler in useStationTestingController only when a
  // new tracking number creates a new row — serial additions do NOT fire this.
  useEffect(() => {
    const handleNewLog = (e: any) => {
      const record = e?.detail as TechRecord | null;
      if (!record) return;
      if (techId !== 'all' && Number(record.tested_by) !== techId) return;
      const rid = record.id;
      if (rid == null || (typeof rid === 'number' && !Number.isFinite(rid))) return;

      prependTechRecordToMatchingWeekCaches(queryClient, techId, record);
      invalidateTechCounts(queryClient);
    };
    window.addEventListener('tech-log-added', handleNewLog);
    return () => window.removeEventListener('tech-log-added', handleNewLog);
  }, [queryClient, techId]);

  return query;
}
