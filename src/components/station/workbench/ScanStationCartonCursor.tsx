'use client';

/**
 * Carton cursor — `↑` next / `↓` previous.
 *
 * Queue reads newest-at-top, so advancing moves UP. Mount sites:
 * - Displays **closed** — vertical stack on {@link ScanStationUtilityRail}
 * - Displays **open** — same header row as `→|` / fullscreen on
 *   {@link UnboxPushColumn} (`orientation="horizontal"`, `size="sm"`)
 *
 * Never inside CartonContextCard / Photos.
 */

import { ChevronDown, ChevronUp } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function ScanStationCartonCursor({
  onNext,
  onPrev,
  orientation = 'vertical',
  size = 'xs',
  nextTestId,
  prevTestId,
  groupTestId,
}: {
  onNext?: () => void;
  onPrev?: () => void;
  orientation?: 'vertical' | 'horizontal';
  /** Panel header row uses `sm` to match `→|` / fullscreen; utility rail stays `xs`. */
  size?: 'xs' | 'sm';
  nextTestId: string;
  prevTestId: string;
  groupTestId: string;
}) {
  if (!onNext && !onPrev) return null;

  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div
      className={cn(
        'flex items-center gap-0',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
      )}
      data-testid={groupTestId}
    >
      {onNext ? (
        <HoverTooltip label="Next carton" asChild>
          <IconButton
            size={size}
            tone="neutral"
            ariaLabel="Next carton"
            icon={<ChevronUp className={glyph} />}
            onClick={onNext}
            className={cn(size === 'sm' && 'rounded-none')}
            data-testid={nextTestId}
          />
        </HoverTooltip>
      ) : null}
      {onPrev ? (
        <HoverTooltip label="Previous carton" asChild>
          <IconButton
            size={size}
            tone="neutral"
            ariaLabel="Previous carton"
            icon={<ChevronDown className={glyph} />}
            onClick={onPrev}
            className={cn(size === 'sm' && 'rounded-none')}
            data-testid={prevTestId}
          />
        </HoverTooltip>
      ) : null}
    </div>
  );
}
