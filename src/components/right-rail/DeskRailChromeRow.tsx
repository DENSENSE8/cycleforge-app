'use client';

/**
 * DeskRailChromeRow — SoT for Unbox-aligned chrome on a single RightRailHost card.
 *
 * ```text
 * [host →|] [actions?] …………………… [cursor?] [↑][↓] [trailing?]
 * ```
 *
 * **Why this exists.** Unbox reads `[→|] ……… [↑ ↓]` across TWO regions
 * (column band + pane carton cursor) with the procedure progress ring on the
 * Displays strip `rightSlot` (right of ⋮). Cargo-culting that absolute host
 * *inside* a Desk card applies `top-2` only to the trailing cluster and splits
 * the baseline. When every control lives in one card, they must share ONE
 * in-flow flex row.
 *
 * **Close is host-owned.** `RightRailHost` paints the single `→|` at the
 * absolute top-left and fires `closeAndCachePanel()`. This row keeps a spacer
 * so actions/↑↓ do not sit under that control. Do not mount a second close
 * here — `onClose` is accepted so callers compile, then ignored.
 *
 * **`actions`** — optional contextual icon cluster for occupants whose actions
 * belong on the navigation row. Sits after close, left of the flex spacer +
 * ↑↓. History `detail:history` deliberately does not use this slot: its
 * contextual topics own a dedicated second row.
 *
 * **`cursor`** — optional `N / M` readout (`CursorPositionReadout`) immediately
 * before ↑↓. Desk `detail:order` and Incoming-family rails compose this.
 *
 * **`trailing`** — far-right peer after ↑↓ (e.g. Incoming Sync) — Desk twin of
 * station strip controls that need a trailing instrument face.
 *
 * identity lives in `PaneHeaderLabel` below this row, not in this chrome.
 */

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { InspectorColumnDisplayButton } from '@/components/right-rail/InspectorColumnDisplayButton';
import { cn } from '@/utils/_cn';

/** Optical `pl-2` — Unbox push-band twin so the `→|` mark lands on content ink.
 *  `relative z-header` keeps Hide above the inset resize sash (`z-sticky`). */
const DESK_RAIL_CHROME_ROW_CLASS =
  'relative z-header flex h-8 shrink-0 items-center pl-2 pr-2';

export function DeskRailChromeRow({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  prevTitle = 'Previous row',
  nextTitle = 'Next row',
  prevTestId,
  nextTestId,
  /**
   * Contextual icon cluster between close and the cursor. Compose
   * `PaneHeaderActionBar iconOnly variant="flat"` — do not invent a page-local
   * icon bar.
   */
  actions,
  /** `N / M` readout — sits before ↑↓ (desk queue walk). */
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
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  prevTitle?: string;
  nextTitle?: string;
  prevTestId?: string;
  nextTestId?: string;
  actions?: ReactNode;
  cursor?: ReactNode;
  trailing?: ReactNode;
  columnDisplay?: boolean;
  className?: string;
}) {
  const hasTrail = Boolean(onPrev || onNext || cursor || trailing);

  return (
    <div className={cn(DESK_RAIL_CHROME_ROW_CLASS, className)}>
      <span
        className="inline-block h-7 w-7 shrink-0"
        aria-hidden
        data-right-rail-host-close-slot
      />
      {columnDisplay ? (
        <div className="ml-0.5 flex shrink-0 items-center">
          <InspectorColumnDisplayButton />
        </div>
      ) : null}
      {actions ? (
        <div
          className="ml-0.5 flex min-w-0 items-center overflow-x-auto"
          data-testid="desk-rail-chrome-actions"
        >
          {actions}
        </div>
      ) : null}
      {hasTrail ? <div className="flex-1" /> : null}
      {hasTrail ? (
        <div className="flex items-center gap-0">
          {cursor}
          {onPrev ? (
            <HoverTooltip label={prevTitle} asChild>
              <IconButton
                size="xs"
                tone="neutral"
                disabled={prevDisabled}
                ariaLabel={prevTitle}
                icon={<ChevronUp className="h-4 w-4" />}
                onClick={onPrev}
                data-testid={prevTestId}
              />
            </HoverTooltip>
          ) : null}
          {onNext ? (
            <HoverTooltip label={nextTitle} asChild>
              <IconButton
                size="xs"
                tone="neutral"
                disabled={nextDisabled}
                ariaLabel={nextTitle}
                icon={<ChevronDown className="h-4 w-4" />}
                onClick={onNext}
                data-testid={nextTestId}
              />
            </HoverTooltip>
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
