'use client';

/**
 * `GET /api/support/list` as a query — the ONE client read of the Support
 * list (desk `/support` and phone `/m/support` pass their own URL params; the
 * server cuts rows, chip counts and facets through the same predicate).
 * Keyed under `qk.supportItems.all`, so any Support write that invalidates
 * that prefix refreshes every list.
 */

import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import type { SupportLocalStatus } from '@/lib/support/conversation/model';
import type { SupportListRow } from './support-list';

export interface SupportListResponse {
  rows: SupportListRow[];
  /** Per local status, over the view + facet scope with the status chips ignored. */
  statusCounts: Record<SupportLocalStatus, number>;
  total: number;
  /** The clock the statuses and flags were computed against. */
  nowMs: number;
}

/** Every Support list query; invalidate after a Support write. */
export const SUPPORT_LIST_QUERY_KEY = [...qk.supportItems.all, 'list'] as const;

async function loadSupportList(search: string): Promise<SupportListResponse> {
  const res = await fetch(`/api/support/list${search ? `?${search}` : ''}`, { cache: 'no-store', credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({}))) as Partial<SupportListResponse> & { success?: boolean; error?: string };
  if (!res.ok || data.success === false || !data.rows || !data.statusCounts) {
    throw new Error(data.error || `Could not load Support items (${res.status})`);
  }
  return { rows: data.rows, statusCounts: data.statusCounts, total: data.total ?? data.rows.length, nowMs: data.nowMs ?? Date.now() };
}

/** `search` = the list's URL params (`view`, `status`, `platform`, `account`, `assignee`, `sort`, `group`, `q`) as a query string. */
export function useSupportList(search: string) {
  return useQuery({
    queryKey: [...SUPPORT_LIST_QUERY_KEY, search],
    queryFn: () => loadSupportList(search),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}
