'use client';

/**
 * Carton cursor — `↑` previous / `↓` next.
 *
 * **Same mapping as left-sidebar / {@link DeskRailChromeRow}:** ArrowUp and
 * ChevronUp step **prev** (toward the top of the list); ArrowDown / ChevronDown
 * step **next**. Never invert — the 2026-08-02 "↑ = next" station carve-out
 * fought the rail + Desk chrome and is retired.
 *
 * Mount sites:
 * - Displays **closed** — vertical on {@link ScanStationUtilityRail}
 * - Displays **open** — same header row as `→|` / fullscreen
 *   (`orientation="horizontal"`, `size="sm"`)
 *
 * Never inside CartonContextCard / Photos.
 */

import { ChevronDown, ChevronUp } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function ScanStationCartonCursor({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  orientation = 'vertical',
  size = 'xs',
  prevTestId,
  nextTestId,
  groupTestId,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  orientation?: 'vertical' | 'horizontal';
  /** Panel header row uses `sm` to match `→|` / fullscreen; utility rail stays `xs`. */
  size?: 'xs' | 'sm';
  prevTestId: string;
  nextTestId: string;
  groupTestId: string;
}) {
  if (!onPrev && !onNext) return null;

  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div
      className={cn(
        'flex gap-0',
        orientation === 'vertical' ? 'flex-col items-center' : 'h-full flex-row items-stretch',
      )}
      data-testid={groupTestId}
    >
      {onPrev ? (
        <HoverTooltip label="Previous carton" asChild>
          <IconButton
            size={size}
            tone="neutral"
            disabled={prevDisabled}
            ariaLabel="Previous carton"
            icon={<ChevronUp className={glyph} />}
            onClick={onPrev}
            className={cn(size === 'sm' && 'h-full w-auto aspect-square rounded-none')}
            data-testid={prevTestId}
          />
        </HoverTooltip>
      ) : null}
      {onNext ? (
        <HoverTooltip label="Next carton" asChild>
          <IconButton
            size={size}
            tone="neutral"
            disabled={nextDisabled}
            ariaLabel="Next carton"
            icon={<ChevronDown className={glyph} />}
            onClick={onNext}
            className={cn(size === 'sm' && 'h-full w-auto aspect-square rounded-none')}
            data-testid={nextTestId}
          />
        </HoverTooltip>
      ) : null}
    </div>
  );
}
