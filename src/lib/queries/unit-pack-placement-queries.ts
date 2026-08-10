import { queryOptions } from '@tanstack/react-query';
import type { PackPlaceableLocation } from '@/lib/packing/pack-placement';
import type { UnitPackPlacementCountRow } from '@/lib/packing/unit-pack-placement';

async function fetchUnitPackPlacement(): Promise<{
  success: boolean;
  locations: PackPlaceableLocation[];
  counts: UnitPackPlacementCountRow[];
  totalPlaced: number;
}> {
  const res = await fetch('/api/units/pack-placement');
  if (!res.ok) {
    throw new Error(`unit-pack-placement ${res.status}`);
  }
  return res.json();
}

export function unitPackPlacementQuery() {
  return queryOptions({
    queryKey: ['units', 'pack-placement'] as const,
    queryFn: fetchUnitPackPlacement,
    staleTime: 15_000,
  });
}
