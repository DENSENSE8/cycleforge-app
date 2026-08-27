'use client';

/**
 * @domain-job Closed-Displays utility rail — the Root Index as an icon rail on
 *   the right edge of EVERY scan station, in the index's own order.
 * @hardware-target Station
 * @density floor
 * @justification There is no second answer to compose. This IS the station
 *   right-edge strip; it replaces four page-local twins (see below).
 *
 * **One strip for six stations (unified 2026-08-19).** Unbox and Arrival
 * composed a shared body with the index icons, while Pack, Tech, Support
 * Orders and Packer Review each hand-rolled
 * `<div><StationDisplaysEdgeToggle variant="pane-open" /></div>` — the same job,
 * four page-local twins, and the operator got icons on two stations and a bare
 * arrow on four. All six now mount this.
 *
 * **No footer button (removed 2026-08-19).** The whole strip is the open
 * control — `role="button"`, Enter/Space, click anywhere — so a `←|` cell at the
 * foot was a second door onto the one action the strip already performs, in the
 * corner with the least room to say anything. Same ruling the left dock's
 * collapse strip took, for the same reason. `⌘]` still toggles.
 *
 * Ordering comes from the index rail itself ({@link StationDisplaysParkedRail}),
 * which flattens `groupDisplayIndexRows` — so a display sits at the same ordinal
 * here, in the parked strip, and in the open index.
 */

import type { ReactNode, KeyboardEvent } from 'react';

export function StationDisplaysUtilityRail({
  onOpenDisplays,
  indexRail = null,
}: {
  /** Open the Displays column on its Root Index. */
  onOpenDisplays: () => void;
  /**
   * Root Index icons ({@link StationDisplaysParkedRail}). Honest absence: a
   * station that declares no index rows paints an empty strip that still opens.
   */
  indexRail?: ReactNode;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenDisplays();
    }
  };

  return (
    <div
      className="flex h-full w-full cursor-pointer flex-col items-center"
      data-testid="scan-station-displays-open-strip"
      role="button"
      tabIndex={0}
      aria-label="Open displays"
      onClick={onOpenDisplays}
      onKeyDown={onKeyDown}
    >
      {indexRail ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-stretch">
          {indexRail}
        </div>
      ) : (
        <div className="min-h-0 flex-1" aria-hidden />
      )}
    </div>
  );
}
