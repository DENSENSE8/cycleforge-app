'use client';

/**
 * Sticky leaf chrome — Back to Displays index (or close in leaf-only nav) + title.
 */

import { ChevronLeft } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function StationDisplayLeafHeader({
  title,
  onBack,
  backLabel = 'Back to Displays',
}: {
  title: string;
  onBack: () => void;
  /** Tooltip / aria for the leading control. */
  backLabel?: string;
}) {
  return (
    <div
      className={cn(
        'sticky top-0 z-raised flex h-10 shrink-0 items-center gap-1 border-b border-border-hairline bg-surface-card px-2',
      )}
      data-testid="station-displays-leaf-header"
    >
      <HoverTooltip label={backLabel} asChild>
        <IconButton
          size="sm"
          tone="neutral"
          ariaLabel={backLabel}
          icon={<ChevronLeft className="h-4 w-4" />}
          onClick={onBack}
          className="rounded-none"
          data-testid="station-displays-back"
        />
      </HoverTooltip>
      <span className="min-w-0 truncate text-role-caption font-semibold text-text-default">
        {title}
      </span>
    </div>
  );
}
