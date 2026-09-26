'use client';

/** DeskRailChromeRow — SoT for Unbox-aligned chrome on a single RightRailHost card. */

import type { ReactNode } from 'react';
import { STATION_DISPLAYS_PUSH_TOP_BAND } from '@/components/station/entity-context/station-identity-chrome';
import {
  STATION_CHROME_ROW_FACE,
} from '@/components/station/entity-context';
import { cn } from '@/utils/_cn';

/** Optical `pl-2` — Unbox push-band twin so the leading mark lands on content ink. */
/** The desk top row IS the Displays top band, plus a leading inset. */
const DESK_RAIL_CHROME_ROW_CLASS =
  `${STATION_DISPLAYS_PUSH_TOP_BAND} pointer-events-auto pl-2`;

/** Trailing spacer the host's control cluster paints into — matches {@link STATION_CHROME_ROW_FACE}. */
export const RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS =
  'pointer-events-none inline-block h-full w-14 shrink-0';

export function DeskRailChromeRow({
  /**
   * Contextual icon cluster between close and the cursor. Compose
   * `PaneHeaderActionBar iconOnly variant="flat"` — do not invent a page-local
   * icon bar.
   */
  actions,
  /** `N / M` readout — where the RAIL's selection sits. */
  cursor,
  /** Far-right twin of the Unbox scan-progress ring (e.g. Incoming Sync). */
  trailing,
  className,
}: {
  /** Ignored — `RightRailHost` owns the singleton `→|`. Kept so callers compile. */
  onClose?: () => void;
  closeTitle?: string;
  actions?: ReactNode;
  cursor?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const hasTrail = Boolean(cursor || trailing);

  return (
    <div className={cn(DESK_RAIL_CHROME_ROW_CLASS, className)}>
      {actions ? (
        <div
          className="flex h-full min-w-0 items-stretch overflow-x-auto"
          data-testid="desk-rail-chrome-actions"
        >
          {actions}
        </div>
      ) : null}
      <div className="flex-1" />
      {hasTrail ? (
        <div className="flex h-full items-stretch gap-0">
          {cursor}
          {trailing}
        </div>
      ) : null}
      {/* The host's absolute `X` lives over this cell — reserve it so nothing
          above scrolls or truncates underneath the singleton close. Square
          matches {@link STATION_CHROME_ROW_FACE} (h-7 / 28px). */}
      <span
        className={RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS}
        aria-hidden
        data-right-rail-host-close-slot
      />
    </div>
  );
}
