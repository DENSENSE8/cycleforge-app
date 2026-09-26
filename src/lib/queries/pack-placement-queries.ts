import { queryOptions } from '@tanstack/react-query';
import type {
  PackPlaceableLocation,
  PackPlacementCountRow,
  RecentPackPlacement,
} from '@/lib/packing/pack-placement';

interface PackPlacementRead {
  success: boolean;
  locations: PackPlaceableLocation[];
  counts: PackPlacementCountRow[];
  totalPlaced: number;
  /** Only populated when `excludeOrderId` is passed (the Last entry desk). */
  recent?: RecentPackPlacement | null;
}

async function fetchPackPlacement(
  excludeOrderId: number | null,
): Promise<PackPlacementRead> {
  const qs =
    excludeOrderId != null
      ? `?excludeOrderId=${encodeURIComponent(String(excludeOrderId))}`
      : '';
  const res = await fetch(`/api/orders/pack-placement${qs}`);
  if (!res.ok) {
    throw new Error(`pack-placement ${res.status}`);
  }
  return res.json();
}

/** Packing benches + their open counts. */
export function packPlacementQuery(
  opts: { excludeOrderId?: number | null } = {},
) {
  const excludeOrderId = opts.excludeOrderId ?? null;
  return queryOptions({
    queryKey: ['orders', 'pack-placement', excludeOrderId] as const,
    queryFn: () => fetchPackPlacement(excludeOrderId),
    staleTime: 15_000,
  });
}
