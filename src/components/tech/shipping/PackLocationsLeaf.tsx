'use client';

/**
 * @domain-job Ready-to-Pack Displays → Locations, bound to the pack-placement
 *   writer (`order_pack_placements`).
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse UnboxLocationsLeaf — same leaf, different
 *   storage, and this port declares `canPlaceMinted: false` because a minted
 *   shelf BIN is not a placeable packing desk.
 *
 * Ready-to-Pack Displays → Locations: the shared station leaf on the pack
 * placement writer.
 *
 * Adapter boundary only — the leaf is `StationLocationsDisplay`. Place / Print
 * run over the packing benches; **New** mints and prints a shelf address but
 * does not offer Create & place, because `order_pack_placements` accepts only
 * DESK / STAGING rows and a minted BIN would bounce
 * (`canPlaceMinted: false` — see the port docs).
 */

import { useMemo } from 'react';
import {
  StationLocationsDisplay,
  type StationLocationPlacementPort,
} from '@/components/station/location';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import type { PackOrderPlacement } from './usePackOrderPlacement';

export function PackLocationsLeaf({
  placement,
  onPlaced,
}: {
  placement: PackOrderPlacement;
  onPlaced?: () => void;
}) {
  const { locations, locationsLoading, locationId, moveTo, refreshCatalog } = placement;

  const port = useMemo<StationLocationPlacementPort>(
    () => ({
      locations: locations.map((l) => ({
        id: l.id,
        // Bench label SoT — never a hand-rolled strip of the row name.
        name: packBenchShortLabel({
          locationName: l.name,
          locationDisplayName: l.displayName,
          locationKind: l.locationKind,
        }),
        room: l.room ?? null,
        barcode: l.barcode ?? null,
      })),
      locationsLoading,
      placedLocationId: locationId,
      place: (id: number) => moveTo({ locationId: id }),
      refreshCatalog,
      entityNoun: 'order',
      canPlaceMinted: false,
    }),
    [locationId, locations, locationsLoading, moveTo, refreshCatalog],
  );

  return <StationLocationsDisplay port={port} onPlaced={onPlaced} />;
}
