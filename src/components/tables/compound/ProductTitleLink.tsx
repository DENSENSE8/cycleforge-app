'use client';

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CompoundLine } from './CompoundCell';

/**
 * Shared product-title listing face for compound and triage rows.
 *
 * The title is the listing target, not a separate glyph beneath it. Keeping the
 * anchor and its event boundary here prevents each station from inventing a
 * slightly different clickable-title implementation.
 */
export function ProductTitleLink({
  title,
  href,
  className,
  tooltipLabel,
}: {
  title: string;
  href?: string | null;
  className?: string;
  tooltipLabel?: string;
}): ReactNode {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;

  const titleFace = href?.trim() ? (
    <a
      href={href.trim()}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'min-w-0 truncate text-text-default hover:text-text-info hover:underline',
        'focus-visible:text-text-info focus-visible:underline underline-offset-2',
        focusRing('control'),
        className,
      )}
    >
      {trimmedTitle}
    </a>
  ) : (
    <span className={cn('min-w-0 truncate text-text-default', className)}>{trimmedTitle}</span>
  );

  // Truncation hover is the rest of the title. The listing URL is the
  // anchor's job (`href`); putting it in the tooltip made a clipped name
  // look like a link destination.
  return (
    <HoverTooltip label={tooltipLabel ?? trimmedTitle} asChild>
      <CompoundLine>{titleFace}</CompoundLine>
    </HoverTooltip>
  );
}
