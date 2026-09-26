'use client';

/** @domain-job Unbox Displays → Locations, bound to the line-putaway writer. */

import { StationLocationsDisplay } from '@/components/station/location';
import { useReceivingLineLocationPort } from '@/components/receiving/line-location-port';

export function UnboxLocationsLeaf({
  lineId,
  stagedLocationId,
  onPlaced,
}: {
  lineId: number | null | undefined;
  stagedLocationId?: number | null;
  onPlaced?: () => void;
}) {
  const port = useReceivingLineLocationPort({
    lineId,
    stagedLocationId,
    entityNoun: 'carton',
  });

  return <StationLocationsDisplay port={port} onPlaced={onPlaced} />;
}
