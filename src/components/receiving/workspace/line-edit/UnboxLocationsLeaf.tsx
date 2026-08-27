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
 * Adapter boundary only — the leaf is {@link StationLocationsDisplay}, the port
 * is {@link useReceivingLineLocationPort} (`receiving_line_putaway`, via
 * {@link useUnboxLinePlacement}). Never a page-local twin of either; Arrival's
 * product subject mounts the SAME port, and Ready to Pack mounts the same leaf
 * with its own storage behind it.
 *
 * `entityNoun="carton"` is preserved deliberately: at Unbox the open line IS
 * the box in the operator's hands, so the row subtitle reads "carton is here".
 * Arrival says `item`, because there the carton is a separate subject on the
 * same leaf and the two must not both claim the word.
 */

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
