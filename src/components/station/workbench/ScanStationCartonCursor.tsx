'use client';

/**
 * Carton cursor — `↑` next / `↓` previous.
 *
 * Queue reads newest-at-top, so advancing moves UP. Mount sites:
 * - Displays **closed** — vertical stack on {@link ScanStationUtilityRail}
 * - Displays **open** — horizontal pair at {@link UnboxPushColumn} top-right
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
  nextTestId,
  prevTestId,
  groupTestId,
}: {
  onNext?: () => void;
  onPrev?: () => void;
  orientation?: 'vertical' | 'horizontal';
  nextTestId: string;
  prevTestId: string;
  groupTestId: string;
}) {
  if (!onNext && !onPrev) return null;

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
            size="xs"
            tone="neutral"
            ariaLabel="Next carton"
            icon={<ChevronUp className="h-4 w-4" />}
            onClick={onNext}
            data-testid={nextTestId}
          />
        </HoverTooltip>
      ) : null}
      {onPrev ? (
        <HoverTooltip label="Previous carton" asChild>
          <IconButton
            size="xs"
            tone="neutral"
            ariaLabel="Previous carton"
            icon={<ChevronDown className="h-4 w-4" />}
            onClick={onPrev}
            data-testid={prevTestId}
          />
        </HoverTooltip>
      ) : null}
    </div>
  );
}
