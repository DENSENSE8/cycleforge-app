'use client';

/**
 * Closed-Displays utility rail body — carton cursor (top) + Open displays
 * (`←|`) in the **bottom** footer cell. Twin of the left-dock expand seat
 * ({@link STATION_UTILITY_RAIL_FOOTER_CLASS}).
 *
 * Whole-strip click opens Displays (empty mid / padding); carton `↑↓` and the
 * footer `←|` stopPropagation so they keep their own hits.
 */

import type { ReactNode } from 'react';
import { STATION_UTILITY_RAIL_FOOTER_CLASS } from '@/components/station/workbench/workbench-layout';
import { StationDisplaysEdgeToggle } from '@/components/station/displays';

export function UnboxDisplaysUtilityRailBody({
  onOpenDisplays,
  cartonCursor = null,
}: {
  onOpenDisplays: () => void;
  cartonCursor?: ReactNode;
}) {
  return (
    <div
      className="flex h-full w-full cursor-pointer flex-col items-center"
      data-testid="scan-station-displays-open-strip"
      onClick={onOpenDisplays}
    >
      {cartonCursor ? (
        <div onClick={(e) => e.stopPropagation()}>{cartonCursor}</div>
      ) : null}
      <div
        className={STATION_UTILITY_RAIL_FOOTER_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <StationDisplaysEdgeToggle variant="pane-open" onClick={onOpenDisplays} />
      </div>
    </div>
  );
}
