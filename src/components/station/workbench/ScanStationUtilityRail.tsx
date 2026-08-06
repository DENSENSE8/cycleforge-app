'use client';

/**
 * Scan-station utility rail — slim white trailing chrome.
 *
 * Hosts Displays open (`←|`) + carton cursor (`↑` next / `↓` prev) as a
 * vertical stack. Sibling of the center work column on
 * {@link StationScanPaneHost} — never inside carton identity / Photos.
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
      className={STATION_UTILITY_RAIL_CLASS}
    >
      {children}
    </aside>
  );
}
