'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';

/** One row of the unified audit + station-activity feed (`GET /api/admin/logs`). */
export type UnifiedLogRow = {
  event_id: string;
  kind: 'AUDIT' | 'SAL';
  created_at: string;
  actor_staff_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  station: string | null;
  action: string;
  source: string | null;
  entity_type: string | null;
  entity_id: string | null;
  station_activity_log_id: number | null;
  notes: string | null;
  scan_ref: string | null;
  fnsku: string | null;
  detail_value: string | null;
  detail_route: string | null;
  metadata: Record<string, unknown> | null;
};

export const ADMIN_LOGS_PAGE_LIMIT = 100;

/**
 * One page of Operations › Logs under the URL's filters — `?search=`,
 * `?logKind=` (audit · sal), `?actorStaffId=` — the contextual sidebar's
 * controls. The stage picker and the event record share it (same key, same
 * `offset`), so the record is always found on the page the picker shows.
 */
export function useAdminLogsPage(offset: number) {
  const searchParams = useSearchParams();
  const search = (searchParams.get('search') ?? '').trim();
  const kindRaw = searchParams.get('logKind');
  const kind = kindRaw === 'audit' || kindRaw === 'sal' ? kindRaw : 'all';
  const actorRaw = Number(searchParams.get('actorStaffId'));
  const actorStaffId = Number.isFinite(actorRaw) && actorRaw > 0 ? actorRaw : null;

  return useQuery({
    queryKey: ['admin-logs', { search, kind, actorStaffId, offset }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(ADMIN_LOGS_PAGE_LIMIT));
      params.set('offset', String(offset));
      if (search) params.set('q', search);
      if (kind !== 'all') params.set('kind', kind);
      if (actorStaffId != null) params.set('actorStaffId', String(actorStaffId));
      const res = await fetch(`/api/admin/logs?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load admin logs');
      return {
        rows: (Array.isArray(data?.rows) ? data.rows : []) as UnifiedLogRow[],
        hasMore: Boolean(data?.pagination?.hasMore),
      };
    },
    placeholderData: keepPreviousData,
  });
}
