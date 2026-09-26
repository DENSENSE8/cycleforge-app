'use client';

/** Scan-station pane host — ONE flex row for Unbox · Arrival · Testing. */

import { useCallback, type ReactNode } from 'react';
import { KEYBOARD_REGION_ATTR } from '@/lib/keyboard/keyboard-region-owner';
import { useKeyboardRegionOwner } from '@/lib/keyboard/useKeyboardRegionOwner';
import { cn } from '@/utils/_cn';
import { ScanStationUtilityRail } from './ScanStationUtilityRail';
import {
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
  // The center is ALWAYS the elastic absorber (`flex-1 min-w-[720px]`) — whether Displays is an in-flow sized sibling or closed.
  const { claim: claimKeyboardRegion } = useKeyboardRegionOwner();
  const claimMiddle = useCallback(() => {
    claimKeyboardRegion('middle');
  }, [claimKeyboardRegion]);
  return (
    <div
      className={cn(STATION_SCAN_PANE_HOST_CLASS, hostPadClass)}
      data-testid={hostTestId}
      {...hostDataAttrs}
    >
      <div
        className={STATION_CENTER_COLUMN_OPEN_CLASS}
        data-testid={centerTestId}
        {...{ [KEYBOARD_REGION_ATTR]: 'middle' }}
        onPointerDownCapture={claimMiddle}
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
