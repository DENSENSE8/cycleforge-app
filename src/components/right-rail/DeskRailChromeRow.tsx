'use client';

/**
 * DeskRailChromeRow — SoT for Unbox-aligned chrome on a single RightRailHost card.
 *
 * ```text
 * [→|] ……………………………… [↑][↓][trailing?]
 * ```
 *
 * **Why this exists.** Unbox reads `[→|] ……… [↑ ↓ ◯]` across TWO regions
 * (column band + pane-absolute `stationMoreDetailsPaneHostClass`) that both sit
 * at canvas+8px. Cargo-culting that absolute host *inside* a Desk card applies
 * `top-2` only to the trailing cluster and splits the baseline. When every
 * control lives in one card, they must share ONE in-flow flex row.
 *
 * Orders keep {@link RecordPaneHeader} / `PaneHeaderActionBar onClose` (close
 * leads the trailing cluster). Incoming-family Desk rails compose this row.
 *
 * Recipe: `.claude/rules/display/right-rail-inspector.md` → Desk single-card
 * chrome. Guard: `right-rail-inspector-header.guard.test.ts`.
 */

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/** Optical `pl-2` — Unbox push-band twin so the `→|` mark lands on content ink. */
const DESK_RAIL_CHROME_ROW_CLASS = 'flex h-8 shrink-0 items-center pl-2 pr-2';

export function DeskRailChromeRow({
  onClose,
  closeTitle = 'Hide right panel',
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  prevTitle = 'Previous row',
  nextTitle = 'Next row',
  prevTestId,
  nextTestId,
  /** Far-right twin of the Unbox scan-progress ring (e.g. Incoming Sync). */
  trailing,
  className,
}: {
  onClose: () => void;
  closeTitle?: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  prevTitle?: string;
  nextTitle?: string;
  prevTestId?: string;
  nextTestId?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  const hasTrail = Boolean(onPrev || onNext || trailing);

  return (
    <div className={cn(DESK_RAIL_CHROME_ROW_CLASS, className)}>
      <PaneHeaderCloseButton
        onClick={onClose}
        title={closeTitle}
        ariaLabel={closeTitle}
        className="-ml-px h-7 w-7"
      />
      {hasTrail ? <div className="flex-1" /> : null}
      {hasTrail ? (
        <div className="flex items-center gap-0">
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
