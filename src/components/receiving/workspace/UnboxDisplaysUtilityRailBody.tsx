'use client';

/**
 * Closed-Displays utility rail body — carton cursor (top), the Root Index as an
 * **icon rail** in the mid, and Open displays (`←|`) in the bottom footer cell.
 *
 * **This is the strip an operator actually sees on a scan station**, and it is
 * NOT the Displays parked strip: this paints while the column is UNMOUNTED,
 * the parked one while the column is mounted but collapsed. Both show the same
 * index icons (2026-08-19) — an operator must not have to know which of two
 * closed states they are looking at to reach a display.
 *
 * The mid used to be empty, so a closed column said nothing about what was
 * behind it and every trip to a display cost open → read index → pick. A cell
 * here opens Displays ON its own leaf.
 *
 * The footer `←|` stays, and is not the duplicate the two parked strips' foot
 * buttons were: it opens the **index**, a different destination from any single
 * leaf, and it is the only affordance on a station that declares no rows.
 *
 * Whole-strip click opens the index (padding / empty mid); carton `↑↓`, the
 * index rail and the footer `←|` stopPropagation so they keep their own hits.
 */

import type { ReactNode } from 'react';
import { STATION_UTILITY_RAIL_FOOTER_CLASS } from '@/components/station/workbench/workbench-layout';
import { StationDisplaysEdgeToggle } from '@/components/station/displays';

export function UnboxDisplaysUtilityRailBody({
  onOpenDisplays,
  cartonCursor = null,
  indexRail = null,
}: {
  onOpenDisplays: () => void;
  cartonCursor?: ReactNode;
  /**
   * Root Index icons ({@link StationDisplaysParkedRail}). Honest absence: a
   * station that declares no index rows paints the `←|` alone, as before.
   */
  indexRail?: ReactNode;
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
      {indexRail ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-stretch">
          {indexRail}
        </div>
      ) : (
        <div className="min-h-0 flex-1" aria-hidden />
      )}
      <div
        className={STATION_UTILITY_RAIL_FOOTER_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <StationDisplaysEdgeToggle variant="pane-open" onClick={onOpenDisplays} />
      </div>
    </div>
  );
}
