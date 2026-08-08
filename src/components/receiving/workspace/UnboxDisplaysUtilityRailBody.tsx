'use client';

/**
 * Closed-Displays utility rail body — carton cursor (top) + Open displays
 * (`←|`) in the **bottom** footer cell. Twin of the left-dock expand seat
 * ({@link STATION_UTILITY_RAIL_FOOTER_CLASS}).
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
    <div className="flex h-full w-full flex-col items-center">
      {cartonCursor}
      <div className={STATION_UTILITY_RAIL_FOOTER_CLASS}>
        <StationDisplaysEdgeToggle variant="pane-open" onClick={onOpenDisplays} />
      </div>
    </div>
  );
}
