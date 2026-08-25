'use client';

/**
 * Line-grain adapter onto {@link StationLocationPlacementPort} — the PRODUCT
 * putaway writer (`receiving_line_putaway.staged_location_id`).
 *
 * The other receiving port is `useTriageLocationPort`, and the two are NOT a
 * hierarchy: that one writes `receiving_triage.staging_location_id`, which is
 * where the unopened CARTON sits on the door shelf. This one answers "where
 * does this ITEM go". Two independent facts on two tables; neither falls back
 * to the other, and widening either to cover both would silently change what
 * every metric reading that column answers.
 *
 * Shared by Unbox (`UnboxLocationsLeaf`) and Arrival (`ArrivalLocationsLeaf`'s
 * product subject). One port, one writer — Arrival is a THIRD mount of the same
 * seam, never a fourth storage.
 */

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StationLocationPlacementPort } from '@/components/station/location';
import { qk } from '@/queries/keys';
import { locationsListQueryOptions, selectScannableBins } from '@/hooks/useLocations';
import type { PutawaySuggestion } from '@/lib/receiving/suggested-putaway-location';
import { useUnboxLinePlacement } from './workspace/line-edit/useUnboxLinePlacement';

/**
 * React Query key for the shelf catalog every station Locations leaf browses.
 *
 * This is now the SAME key `useLocations` reads (`qk.locations.list()`), not a
 * second one over the same endpoint. It used to be `['locations','active']`
 * with its own fetcher, which meant cold `/triage` fetched the identical
 * 8165-byte `/api/locations` body twice. The bin filter that made the two look
 * like different data is a `select` now — see `selectScannableBins`.
 */
export const STATION_LOCATION_CATALOG_KEY = qk.locations.list();

export function receivingLineSuggestionQueryKey(lineId: number | null | undefined) {
  return ['receiving', 'suggested-putaway-location', lineId ?? null] as const;
}

/**
 * The shelf catalog, shared by key with `useTriageStaging` so a shelf minted at
 * Arrival is on the Unbox list immediately.
 */
function useStationLocationCatalog(enabled: boolean) {
  return useQuery({
    ...locationsListQueryOptions(),
    enabled,
    select: selectScannableBins,
  });
}

export function useReceivingLineLocationPort({
  lineId,
  stagedLocationId,
  enabled = true,
  entityNoun = 'item',
}: {
  lineId: number | null | undefined;
  stagedLocationId?: number | null;
  /** False while the leaf is not showing — the catalog read is station-wide. */
  enabled?: boolean;
  /**
   * What the operator is holding. Unbox says `carton` (one open line IS the
   * box in hand there); Arrival's product subject says `item`, because the
   * carton is a separate subject on the same leaf.
   */
  entityNoun?: string;
}): StationLocationPlacementPort {
  const { applyStage } = useUnboxLinePlacement(lineId);
  const queryClient = useQueryClient();
  const locationsQuery = useStationLocationCatalog(enabled);

  const hasLine = lineId != null && Number.isFinite(lineId) && lineId > 0;
  const suggestionQuery = useQuery<PutawaySuggestion | null>({
    queryKey: receivingLineSuggestionQueryKey(hasLine ? lineId : null),
    enabled: enabled && hasLine,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving/lines/${lineId}/suggested-location`,
        { cache: 'no-store' },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { suggestion?: PutawaySuggestion | null };
      return data.suggestion ?? null;
    },
  });

  return useMemo<StationLocationPlacementPort>(
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
      entityNoun,
      canPlaceMinted: true,
      suggestion: suggestionQuery.data ?? null,
      suggestionLoading: suggestionQuery.isLoading,
    }),
    [
      applyStage,
      entityNoun,
      locationsQuery.data,
      locationsQuery.isLoading,
      queryClient,
      stagedLocationId,
      suggestionQuery.data,
      suggestionQuery.isLoading,
    ],
  );
}
