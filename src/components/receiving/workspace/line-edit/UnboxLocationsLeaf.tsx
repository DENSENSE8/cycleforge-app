'use client';

/**
 * @domain-job Unbox Displays → Locations, bound to the line-putaway writer.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse ArrivalLocationsLeaf — same leaf, different
 *   storage: that adapter writes triage `staging_location_id`, this one writes
 *   `receiving_line_putaway` for the open line.
 *
 * Unbox Displays → Locations: the shared station leaf on the line-putaway writer.
 *
 * Adapter boundary only — the leaf is {@link StationLocationsDisplay} and the
 * writer is {@link useUnboxLinePlacement} (`receiving_line_putaway`). Never a
 * page-local twin of either; Arrival and Ready to Pack mount the same leaf with
 * their own storage behind the same port.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  StationLocationsDisplay,
  type StationLocationPlacementPort,
} from '@/components/station/location';
import { qk } from '@/queries/keys';
import type { Location } from '@/lib/neon/location-queries';
import { useUnboxLinePlacement } from './useUnboxLinePlacement';

export function UnboxLocationsLeaf({
  lineId,
  stagedLocationId,
  onPlaced,
}: {
  lineId: number | null | undefined;
  stagedLocationId?: number | null;
  onPlaced?: () => void;
}) {
  const { applyStage } = useUnboxLinePlacement(lineId);
  const queryClient = useQueryClient();

  // Same key as `useTriageStaging` — one catalog read across the stations that
  // browse it, so a shelf minted at Arrival is on the Unbox list immediately.
  const locationsQuery = useQuery<Location[]>({
    queryKey: ['locations', 'active'] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch('/api/locations', { cache: 'no-store' });
      if (!res.ok) return [];
      const data = (await res.json()) as { locations?: Location[] };
      // Real bins only — a room/zone parent isn't a scannable shelf.
      return (data.locations ?? []).filter(
        (l) => l.row_label != null && l.col_label != null,
      );
    },
  });

  const port = useMemo<StationLocationPlacementPort>(
    () => ({
      locations: (locationsQuery.data ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        room: l.room ?? null,
        barcode: l.barcode ?? null,
      })),
      locationsLoading: locationsQuery.isLoading,
      placedLocationId: stagedLocationId ?? null,
      place: (locationId: number) => applyStage({ location_id: locationId }),
      refreshCatalog: () => {
        void queryClient.invalidateQueries({ queryKey: qk.locations.all });
      },
      entityNoun: 'carton',
      canPlaceMinted: true,
    }),
    [applyStage, locationsQuery.data, locationsQuery.isLoading, queryClient, stagedLocationId],
  );

  return <StationLocationsDisplay port={port} onPlaced={onPlaced} />;
}
