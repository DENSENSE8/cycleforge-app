'use client';

/**
 * Scan-station utility rail — slim white trailing chrome.
 *
 * Hosts carton cursor (`↑` / `↓`) at the top and Displays open (`←|`) in the
 * **bottom** footer cell — twin of the left-dock expand seat. Sibling of the
 * center work column on {@link StationScanPaneHost} — never inside carton
 * identity / Photos.
 *
 * Visual twin of the left context collapse strip (flush card, hairline seam).
 */

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
