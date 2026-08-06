'use client';

/**
 * Scan-station dual pane host — ONE flex row for Unbox · Arrival · Testing.
 *
 * When Displays is open: locked 720 middle + slim utility rail + flex-1
 * Displays pinned to the pane's trailing edge. When closed: center fills,
 * utility rail stays on the far right. Never a leading spacer; never sticky
 * Displays that leaves a trailing gutter.
 *
 * Displays `←|` + carton `↑↓` live in {@link ScanStationUtilityRail} — a
 * separate white rail, not carton identity and not an absolute float.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { ScanStationUtilityRail } from './ScanStationUtilityRail';
import {
  STATION_CENTER_COLUMN_CLASS,
  STATION_CENTER_COLUMN_OPEN_CLASS,
  STATION_SCAN_PANE_HOST_CLASS,
} from './workbench-layout';

export function StationScanPaneHost({
  displaysOpen,
  center,
  displays = null,
  utilityRail = null,
  hostPadClass,
  hostTestId,
  centerTestId,
  hostDataAttrs,
}: {
  displaysOpen: boolean;
  center: ReactNode;
  displays?: ReactNode;
  /**
   * Scan-station utility rail body (Displays `←|` · carton `↑↓`). Mounted in
   * {@link ScanStationUtilityRail} between center and Displays. Omit when
   * empty (e.g. Displays open and no carton cursor).
   */
  utilityRail?: ReactNode;
  /** Optional trailing host pad (Unbox ticket push pad token — usually empty). */
  hostPadClass?: string;
  hostTestId?: string;
  centerTestId: string;
  /** Extra `data-*` on the host (e.g. `data-unbox-pane-host`). */
  hostDataAttrs?: Record<string, string | boolean | undefined>;
}) {
  return (
    <div
      className={cn(STATION_SCAN_PANE_HOST_CLASS, hostPadClass)}
      data-testid={hostTestId}
      {...hostDataAttrs}
    >
      <div
        className={
          displaysOpen ? STATION_CENTER_COLUMN_CLASS : STATION_CENTER_COLUMN_OPEN_CLASS
        }
        data-testid={centerTestId}
      >
        {center}
      </div>
      {utilityRail != null ? (
        <ScanStationUtilityRail>{utilityRail}</ScanStationUtilityRail>
      ) : null}
      {displaysOpen ? displays : null}
    </div>
  );
}
