'use client';

/**
 * Scan-station Flex-Grow Sandwich host — ONE flex row for Unbox · Arrival ·
 * Testing. No host `gap-*` / `justify-between` / spacer columns / `ml-auto`
 * detach bands.
 *
 * When Displays is open: locked 720 middle (`shrink-0`) + optional utility rail
 * + Displays invader (`flex-1` — always fills leftover to the pane trailing
 * edge). When closed: center fills (`flex-1`), utility rail stays on the far
 * right. Never a leading spacer; never a hard-coded gutter div.
 *
 * Displays `←|` + carton `↑↓` live in {@link ScanStationUtilityRail} — a
 * separate white rail, not carton identity and not an absolute float. When
 * Displays is open Unbox unmounts the utility rail (cursor moves into the
 * push top band).
 */

import { useSyncExternalStore, type ReactNode } from 'react';
import {
  getStationDisplaysCollapsed,
  subscribeRightRailFrame,
} from '@/lib/right-rail/frame';
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
  // The center is LOCKED at 720 only while Displays is an in-flow push sibling.
  // When the frame budget yields Displays to an overlay (it floats — see
  // StationDisplaysPushColumn), the locked center would leave an empty leftover
  // band to its right (the "gray detach band"); instead the center FILLS
  // (`STATION_CENTER_COLUMN_OPEN_CLASS`, flex-1 min-720) and Displays floats over
  // its right edge (M3 supporting-pane overlay). Same store flag the push column
  // reads — single source, so the two can never disagree.
  const displaysCollapsed = useSyncExternalStore(
    subscribeRightRailFrame,
    getStationDisplaysCollapsed,
    () => false,
  );
  const centerLocked = displaysOpen && !displaysCollapsed;
  return (
    <div
      className={cn(STATION_SCAN_PANE_HOST_CLASS, hostPadClass)}
      data-testid={hostTestId}
      {...hostDataAttrs}
    >
      <div
        className={
          centerLocked ? STATION_CENTER_COLUMN_CLASS : STATION_CENTER_COLUMN_OPEN_CLASS
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
