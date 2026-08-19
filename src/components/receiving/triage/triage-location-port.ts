'use client';

/**
 * Arrival's adapter onto {@link StationLocationPlacementPort}.
 *
 * The triage staging controller IS the writer — `selectShelf` carries the lane
 * auto-route and the manual-wins rule — so this maps its shape onto the shared
 * Locations leaf without moving one line of that policy.
 */

import { useMemo } from 'react';
import type { StationLocationPlacementPort } from '@/components/station/location';
import type { TriageStagingController } from './useTriageStaging';

export function useTriageLocationPort(
  staging: TriageStagingController,
): StationLocationPlacementPort {
  const { locations, locationsLoading, stagingLocationId, selectShelf, refreshCatalog } =
    staging;
  return useMemo(
    () => ({
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        room: l.room ?? null,
        barcode: l.barcode ?? null,
      })),
      locationsLoading,
      placedLocationId: stagingLocationId ?? null,
      place: (locationId: number) => selectShelf(locationId),
      refreshCatalog,
      entityNoun: 'carton',
      // Arrival stages on any shelf BIN — the one it just minted included.
      canPlaceMinted: true,
    }),
    [locations, locationsLoading, refreshCatalog, selectShelf, stagingLocationId],
  );
}
