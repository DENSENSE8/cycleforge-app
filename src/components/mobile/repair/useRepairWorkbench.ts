'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { RepairActionRecord } from '@/lib/repair/repair-actions';
import type { RepairTicketLink } from '@/lib/repair/ticket-link';
import { ticketThreadHandoffQuery, type TicketThreadHandoff } from '@/lib/composer/ticket-thread-handoff';
import { qk } from '@/queries/keys';

/**
 * Reads shared by the workbench screens (`/m/rs/[id]` and its sub-screens).
 *
 * All of them go through the app QueryClient under
 * `qk.repairs.workbench(id, facet)`, so moving hub ↔ sub-screen paints from
 * cache instead of refetching the repair, ticket link, photos and print log on
 * every mount (operator 2026-09-24). Freshness comes from three places, not a
 * short cache: each write refetches the facet it changed, `repair.changed`
 * realtime invalidates `qk.repairs.all` (see `rs/[id]/layout.tsx`), and a
 * stale query revalidates in the background while the cached copy shows.
 */

export const validRepairId = (id: number) => Number.isFinite(id) && id > 0;

/** GET JSON; a non-2xx becomes an Error carrying the route's `error` text. */
export async function fetchRepairJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error || `HTTP ${res.status}`);
  return body as T;
}

const errorText = (err: unknown): string | null => (err ? (err instanceof Error ? err.message : String(err)) : null);

export function useRepairRecord(repairId: number) {
  const queryClient = useQueryClient();
  const key = qk.repairs.workbench(repairId, 'record');
  const valid = validRepairId(repairId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchRepairJson<RSRecord>(`/api/repair-service/${repairId}`, signal),
    enabled: valid,
  });

  /** Optimistic write into the shared cache — every mounted screen sees it. */
  const setRepair = useCallback(
    (next: RSRecord | null | ((current: RSRecord | null) => RSRecord | null)) => {
      queryClient.setQueryData<RSRecord | null>(key, (current) =>
        typeof next === 'function' ? next(current ?? null) : next,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is derived from repairId
    [queryClient, repairId],
  );

  const { refetch } = query;
  const reload = useCallback(async (): Promise<RSRecord | null> => (await refetch()).data ?? null, [refetch]);

  return {
    repair: query.data ?? null,
    setRepair,
    error: valid ? errorText(query.error) : 'Invalid repair id',
    loading: valid && query.isPending,
    reload,
  };
}

/** Bench actions, newest first (`/api/repair/actions`, server-stamped `created_at`). */
export function useRepairActions(repairId: number) {
  const query = useQuery({
    queryKey: qk.repairs.workbench(repairId, 'actions'),
    queryFn: async ({ signal }) => {
      const body = await fetchRepairJson<{ actions?: RepairActionRecord[] }>(
        `/api/repair/actions?repairId=${repairId}`,
        signal,
      );
      return Array.isArray(body.actions) ? body.actions : [];
    },
    enabled: validRepairId(repairId),
  });
  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  return { actions: query.data ?? [], loading: query.isPending, error: errorText(query.error), reload };
}

/**
 * The helpdesk ticket this repair may talk to (`ticket_links`, never the
 * free-typed ticket number). Only `linked` opens the thread with a draft.
 * Links change rarely (a desk link/unlink publishes `repair.changed`), so the
 * cached answer holds for 10 minutes.
 */
export function useRepairTicketLink(repairId: number) {
  const query = useQuery({
    queryKey: qk.repairs.workbench(repairId, 'ticket-link'),
    queryFn: async ({ signal }) =>
      (await fetchRepairJson<{ link: RepairTicketLink }>(`/api/repair-service/${repairId}/ticket-link`, signal)).link,
    enabled: validRepairId(repairId),
    staleTime: 10 * 60 * 1000,
  });
  return { link: query.data ?? null, error: errorText(query.error) };
}

/** Why a repair has no openable ticket thread, in operator words; null when linked. */
export function ticketBlockedReason(link: RepairTicketLink): string | null {
  switch (link.state) {
    case 'linked':
      return null;
    case 'unverified':
      return `Ticket number ${link.ticketNumber} is not linked in the helpdesk — link it on desktop first.`;
    case 'ambiguous':
      return 'More than one ticket is linked — choose one on desktop first.';
    case 'internal':
      return 'The linked ticket is internal-only.';
    default:
      return 'No support ticket is linked to this repair.';
  }
}

/**
 * The phone ticket thread (`/m/t/[ticketId]`) for a linked repair, optionally
 * carrying a prepared reply: a bare string is the editable draft; an object
 * can also stage photos and pick the channel (`TicketThreadHandoff`). Nothing
 * is sent — the thread only seeds its composer. Null unless the link is
 * unambiguous.
 */
export function ticketThreadHref(
  link: RepairTicketLink | null,
  handoff?: string | TicketThreadHandoff,
): string | null {
  if (link?.state !== 'linked') return null;
  const query = ticketThreadHandoffQuery(typeof handoff === 'string' ? { draft: handoff } : handoff);
  return `/m/t/${link.zendeskTicketId}${query}`;
}
