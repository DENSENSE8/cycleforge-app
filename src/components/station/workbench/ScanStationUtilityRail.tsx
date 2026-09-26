'use client';

/** Scan-station utility rail — slim white trailing chrome. */

import type { ReactNode } from 'react';
import { STATION_UTILITY_RAIL_CLASS } from './workbench-layout';

export function ScanStationUtilityRail({ children }: { children: ReactNode }) {
  return (
    <aside
      role="toolbar"
      aria-label="Carton navigation"
      data-testid="scan-station-utility-rail"
      data-station-displays=""
      className={STATION_UTILITY_RAIL_CLASS}
    >
      {children}
    </aside>
  );
}
