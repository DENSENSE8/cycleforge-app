'use client';

/**
 * "Your next work order" — the data half, extracted so the header's single
 * pace-and-next button can know a work order exists **before** its panel opens.
 *
 * The row used to own this query inside the Inbox popover, which meant nothing
 * could see the answer until that popover was already on screen. A combined
 * button has to render a presence mark on the closed face, so the query has to
 * live one level up from the row that draws it.
 *
 * The query key is unchanged (`['work-orders','mine',staffId]`) so every reader
 * shares one cache entry, and the Ably invalidation moves with it — a
 * reassignment still updates without a refetch.
 *
 * NOTE: `/api/work-orders/mine` ranks over queues whose SQL filters `work_type`
 * to the STATION types, so a `FOLLOW_UP` thrown task never appears here. That is
 * correct rather than a gap: a thrown task is delivered as its own inbox row
 * (`reason: 'assigned'`), so it is already surfaced by a more direct route.
 */

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import { isOnWorkOrderSourcePath } from '@/components/layout/header-work-order-shared';

export interface NextWorkOrder {
  id: string;
  queueLabel: string;
  title: string;
  subtitle: string;
  recordLabel: string;
  sourcePath: string;
  deadlineAt: string | null;
  role: 'tester' | 'packer';
}

async function fetchMine(): Promise<{ top: NextWorkOrder | null }> {
  const res = await fetch('/api/work-orders/mine', { cache: 'no-store', credentials: 'include' });
  if (!res.ok) return { top: null };
  return res.json();
}

interface NextWorkOrderState {
  /** The ranked-first work order, or null when there is none to show. */
  top: NextWorkOrder | null;
  /**
   * True while the first fetch is in flight. The button paints an idle face
   * through this rather than popping in — persistent header chrome never
   * `return null`s for "still loading" (source-of-truth.md → GlobalHeader zones).
   */
  loading: boolean;
}

export function useNextWorkOrder(): NextWorkOrderState {
  const { user } = useAuth();
  const pathname = usePathname();
  const staffId = user?.staffId ?? null;
  const orgId = user?.organizationId ?? '';
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => ['work-orders', 'mine', staffId] as const, [staffId]);

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: fetchMine,
    enabled: !!staffId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const ordersChannel = safeChannelName(() => getOrdersChannelName(orgId));
  const invalidate = () => void queryClient.invalidateQueries({ queryKey });
  useAblyChannel(ordersChannel, 'order.assignments', invalidate, !!ordersChannel && !!staffId);
  useAblyChannel(ordersChannel, 'queue.assignments', invalidate, !!ordersChannel && !!staffId);

  const top = data?.top ?? null;

  // Still hidden when the operator is already standing on the record — a door
  // to the room you are in says nothing.
  const suppressed = !staffId || !top || isOnWorkOrderSourcePath(pathname, top.sourcePath);

  return {
    top: suppressed ? null : top,
    loading: !!staffId && isPending,
  };
}
