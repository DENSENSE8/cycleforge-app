'use client';

/**
 * The Sales Monitor's data waist — the three front-desk spines resolved into one
 * merged `WalkInTransaction[]`.
 *
 * Each spine keeps its OWN query, so a failing spine contributes no rows instead
 * of emptying the feed (Monitor degrade-not-fail). Repairs reuses the shared
 * `useRepairsTable` so it inherits that hook's Ably invalidation rather than
 * forking a second repairs fetch.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepairsTable } from '@/hooks/useRepairs';
import {
  mergeTransactions,
  pickupToTransaction,
  repairToTransaction,
  saleToTransaction,
  type PickupOrderRow,
  type SaleRow,
  type WalkInTransaction,
} from '@/lib/walk-in/transactions';

function useSalesHistory() {
  return useQuery<SaleRow[]>({
    queryKey: ['walk-in-history-sales'],
    queryFn: async () => {
      const res = await fetch('/api/walk-in/sales?orderSource=walk_in_sale&limit=100', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load sales');
      const data = (await res.json()) as { rows?: SaleRow[] };
      return data.rows ?? [];
    },
    staleTime: 60_000,
  });
}

function usePickupsHistory() {
  return useQuery<PickupOrderRow[]>({
    queryKey: ['walk-in-history-pickups'],
    queryFn: async () => {
      const res = await fetch('/api/local-pickup-orders?status=COMPLETED&limit=100', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load pickups');
      const data = (await res.json()) as { orders?: PickupOrderRow[] };
      return data.orders ?? [];
    },
    staleTime: 60_000,
  });
}

interface WalkInTransactionsResult {
  rows: WalkInTransaction[];
  /** Cold-load gate: true only while every spine is still pending. */
  isLoading: boolean;
  /** True when every spine failed — the feed has nothing to degrade to. */
  isError: boolean;
  refetch: () => void;
}

export function useWalkInTransactions(): WalkInTransactionsResult {
  const sales = useSalesHistory();
  const pickups = usePickupsHistory();
  const repairs = useRepairsTable(null, 'done');

  const rows = useMemo(
    () =>
      mergeTransactions(
        (sales.data ?? []).map(saleToTransaction),
        (pickups.data ?? []).map(pickupToTransaction),
        (repairs.data ?? []).map(repairToTransaction),
      ),
    [sales.data, pickups.data, repairs.data],
  );

  return {
    rows,
    // Gate on ALL spines, not ANY: one slow spine shouldn't hold the feed, and
    // one fast spine shouldn't flash a half-empty list as though it were whole.
    isLoading: sales.isLoading && pickups.isLoading && repairs.isLoading,
    isError: sales.isError && pickups.isError && repairs.isError,
    refetch: () => {
      void sales.refetch();
      void pickups.refetch();
      void repairs.refetch();
    },
  };
}
