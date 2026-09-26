'use client';

/** @domain-job Closed-Displays utility rail — the Root Index as an icon rail on the right edge of EVERY scan station, in the index's own order. */

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
