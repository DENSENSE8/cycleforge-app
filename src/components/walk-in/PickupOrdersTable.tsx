'use client';

/** Local Pickup mode table — Draft vs Completed local-pickup orders. */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WalkInFeedPane } from '@/components/walk-in/WalkInFeedPane';
import { pickupToTransaction, type PickupOrderRow } from '@/lib/walk-in/transactions';
import { PICKUP_TAB_STATUS, type PickupTab } from '@/lib/walk-in/history-modes';

const LABEL: Record<PickupTab, string> = {
  draft: 'Local Pickup · Draft',
  completed: 'Local Pickup · Completed',
};

const EMPTY: Record<PickupTab, string> = {
  draft: 'No draft pickup orders.',
  completed: 'No completed local pickups yet.',
};

export function PickupOrdersTable({ tab }: { tab: PickupTab }) {
  const status = PICKUP_TAB_STATUS[tab];

  const { data, isLoading, isError, refetch } = useQuery<PickupOrderRow[]>({
    queryKey: ['walk-in-pickups', status],
    queryFn: async () => {
      const res = await fetch(`/api/local-pickup-orders?status=${status}&limit=100`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load pickups');
      const json = (await res.json()) as { orders?: PickupOrderRow[] };
      return json.orders ?? [];
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => (data ?? []).map(pickupToTransaction), [data]);

  return (
    <WalkInFeedPane
      rows={rows}
      isLoading={isLoading}
      isError={isError}
      refetch={refetch}
      label={LABEL[tab]}
      emptyMessage={EMPTY[tab]}
    />
  );
}
