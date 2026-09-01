'use client';

/**
 * Per-staff assigned orders for the mobile homepage preview.
 *
 * Reads `GET /api/work-orders/mine?list=1` — the same mine predicate the
 * to-ship assignment write already feeds (`work_assignments` packer OR tech).
 * Ranking is deadline-banded (R-FLOW-3), not the desktop goal-chip comparator.
 * The full warehouse queue lives on `/m/work` via {@link useToShipOrders}.
 */

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { WorkOrderRow } from '@/components/work-orders/types';
import {
  ASSIGNED_ORDERS_HOME_PREVIEW,
  assignedOrderRows,
  bandWorkOrderRows,
  takeMostUrgentWorkOrders,
  type DeadlineBandGroup,
} from '@/lib/work-orders/deadline-bands';

async function fetchMineList(): Promise<WorkOrderRow[]> {
  const res = await fetch('/api/work-orders/mine?list=1', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  const rows =
    data && typeof data === 'object' && 'rows' in data
      ? (data as { rows: unknown }).rows
      : null;
  return Array.isArray(rows) ? (rows as WorkOrderRow[]) : [];
}

export function useAssignedWorkOrders(): {
  preview: WorkOrderRow[];
  groups: DeadlineBandGroup[];
  isPending: boolean;
  isError: boolean;
} {
  const { user } = useAuth();
  const staffId = user?.staffId ?? null;
  const orgId = user?.organizationId ?? '';
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['work-orders', 'mine', staffId, 'list'] as const, [staffId]);

  const { data, isPending, isError } = useQuery({
    queryKey,
    queryFn: fetchMineList,
    enabled: !!staffId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['work-orders', 'mine', staffId] });
  };
  const ordersChannel = safeChannelName(() => getOrdersChannelName(orgId));
  useAblyChannel(ordersChannel, 'order.assignments', invalidate, !!ordersChannel && !!staffId);
  useAblyChannel(ordersChannel, 'queue.assignments', invalidate, !!ordersChannel && !!staffId);

  const orderRows = useMemo(() => assignedOrderRows(data ?? []), [data]);
  const preview = useMemo(
    () => takeMostUrgentWorkOrders(orderRows, ASSIGNED_ORDERS_HOME_PREVIEW),
    [orderRows],
  );
  const groups = useMemo(() => bandWorkOrderRows(orderRows), [orderRows]);

  return {
    preview,
    groups,
    isPending: !!staffId && isPending,
    isError,
  };
}
