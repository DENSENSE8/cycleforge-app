'use client';

/**
 * @domain-job Arrival Displays → Locations, bound to the triage staging writer.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse StationLocationsDisplay directly here — a port is
 *   built from a hook, and `buildTriageDisplays` assembles elements outside any
 *   component, so this file exists solely to hold that one hook call.
 *
 * Arrival Displays → Locations: the shared station leaf on the triage writer.
 *
 * A hook cannot be called inside `buildTriageDisplays`' element tree, so the
 * port is built here — this file is the adapter boundary and nothing else.
 * The leaf itself is `StationLocationsDisplay`; never fork it.
 */

import { StationLocationsDisplay } from '@/components/station/location';
import { useTriageLocationPort } from './triage-location-port';
import type { TriageStagingController } from './useTriageStaging';

export function ArrivalLocationsLeaf({
  staging,
  onPlaced,
}: {
  staging: TriageStagingController;
  onPlaced?: () => void;
}) {
  const port = useTriageLocationPort(staging);
  return <StationLocationsDisplay port={port} onPlaced={onPlaced} />;
}
