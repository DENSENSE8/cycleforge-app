import { queryOptions } from '@tanstack/react-query';
import type {
  PackPlaceableLocation,
  PackPlacementCountRow,
} from '@/lib/packing/pack-placement';

async function fetchPackPlacement(): Promise<{
  success: boolean;
  locations: PackPlaceableLocation[];
  counts: PackPlacementCountRow[];
  totalPlaced: number;
}> {
  const res = await fetch('/api/orders/pack-placement');
  if (!res.ok) {
    throw new Error(`pack-placement ${res.status}`);
  }
  return res.json();
}

export function packPlacementQuery() {
  return queryOptions({
    queryKey: ['orders', 'pack-placement'] as const,
    queryFn: fetchPackPlacement,
    staleTime: 15_000,
  });
}
