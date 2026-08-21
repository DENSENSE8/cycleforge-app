'use client';

/**
 * DeskRailChromeRow — SoT for Unbox-aligned chrome on a single RightRailHost card.
 *
 * ```text
 * [▦?] [actions?] …………………………………… [cursor?] [trailing?] [host X]
 * ```
 *
 * **No ↑↓ stepper (removed 2026-08-19).** Walking the queue from inside the
 * inspector was a second door onto a selection the left recents rail already
 * owns: the rail is the list, and it is where an operator picks the next
 * record. Two controls for one job meant the inspector could advance the
 * selection without the rail's own cursor agreeing. Pick in the rail.
 * `useRecordCursor` keyboard walking is untouched — it moves the RAIL's cursor,
 * which is the single source the inspector follows.
 *
 * **Why this exists.** Unbox reads `[→|] ……… [↑ ↓]` across TWO regions
 * (column band + pane carton cursor) with the procedure progress ring on the
 * Displays strip `rightSlot` (right of ⋮). Cargo-culting that absolute host
 * *inside* a Desk card applies `top-2` only to the trailing cluster and splits
 * the baseline. When every control lives in one card, they must share ONE
 * in-flow flex row.
 *
 * **Close is host-owned, and it is the TRAILING cell.** `RightRailHost` paints
 * the single `X` absolutely at the top-RIGHT (ruled 2026-08-19) and fires
 * `closeAndCachePanel()`. This row keeps a spacer at the END so the cursor /
 * ↑↓ / trailing cluster never sit under that control, and the LEADING edge is
 * handed back to the occupant's own chrome (`▦`, contextual icons). Do not
 * mount a second close here — `onClose` is accepted so callers compile, then
 * ignored.
 *
 * **`actions`** — optional contextual icon cluster for occupants whose actions
 * belong on the navigation row. Sits after close, left of the flex spacer +
 * ↑↓. History `detail:history` deliberately does not use this slot: its
 * contextual topics own a dedicated second row.
 *
 * **`cursor`** — optional `N / M` readout (`CursorPositionReadout`). A readout,
 * not a control: it says where the rail's selection sits, and moving it is the
 * rail's job.
 *
 * **`trailing`** — far-right peer after ↑↓ (e.g. Incoming Sync) — Desk twin of
 * station strip controls that need a trailing instrument face.
 *
 * identity lives in `PaneHeaderLabel` below this row, not in this chrome.
 */

import type { ReactNode } from 'react';
import { InspectorColumnDisplayButton } from '@/components/right-rail/InspectorColumnDisplayButton';
import { STATION_DISPLAYS_PUSH_TOP_BAND } from '@/components/station/entity-context/station-identity-chrome';
import {
  STATION_CHROME_ROW_FACE,
} from '@/components/station/entity-context';
import { cn } from '@/utils/_cn';

/** Optical `pl-2` — Unbox push-band twin so the leading mark lands on content
 *  ink. Height is {@link STATION_CHROME_ROW_FACE} (carton / Displays top).
 *  `relative z-header` keeps the row above the inset resize sash
 *  (`z-sticky`). Hairline via `after:` so it meets Displays, not a `border-b`. */
/**
 * The desk top row IS the Displays top band, plus a leading inset.
 *
 * Unified 2026-08-19. These were two hand-built strings over the same face, so
 * the flush-trailing fix had to be made twice and the two rows could drift into
 * different heights or seams. `STATION_DISPLAYS_PUSH_TOP_BAND` is the SoT;
 * `pl-2` is the only desk-specific part (a flat panel has no Back chevron to
 * own the left corner, so its leading mark needs the inset the station's does
 * not). `pointer-events-auto` restores hits — the station band is
 * `pointer-events-none` so a resize sash can be grabbed through empty chrome,
 * and a desk row has no sash beneath it.
 */
export const DESK_RAIL_CHROME_ROW_CLASS =
  `${STATION_DISPLAYS_PUSH_TOP_BAND} pointer-events-auto pl-2`;

/**
 * Trailing spacer the host's control cluster paints into — matches
 * {@link STATION_CHROME_ROW_FACE}. TWO cells (`w-14`) since 2026-08-20: the
 * host paints maximize alongside close whenever the panel is a resizable push
 * occupant, and a one-cell reserve let occupant content scroll under it.
 */
export const RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS = 'inline-block h-full w-14 shrink-0';

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
  /**
   * Grid workbenches: Column display lives in the inspector, not Band 3.
   * Renders ▦ after close so a record peek still has a door onto
   * `detail:grid-column-details`.
   */
  columnDisplay = false,
  className,
}: {
  /** Ignored — `RightRailHost` owns the singleton `→|`. Kept so callers compile. */
  onClose?: () => void;
  closeTitle?: string;
  actions?: ReactNode;
  cursor?: ReactNode;
  trailing?: ReactNode;
  columnDisplay?: boolean;
  className?: string;
}) {
  const hasTrail = Boolean(cursor || trailing);

  return (
    <div className={cn(DESK_RAIL_CHROME_ROW_CLASS, className)}>
      {columnDisplay ? (
        <div className="flex h-full shrink-0 items-stretch">
          <InspectorColumnDisplayButton />
        </div>
      ) : null}
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
