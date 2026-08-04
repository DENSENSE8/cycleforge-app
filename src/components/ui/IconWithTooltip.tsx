'use client';

import type { ComponentType } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

interface IconWithTooltipProps {
  Icon: ComponentType<{ className?: string }>;
  label: string;
  iconClassName?: string;
  className?: string;
}

/**
 * Compact icon with a meaning/help tooltip.
 *
 * Uses {@link HoverTooltip} (sans-serif, wraps, viewport-clamped) — not
 * SiteTooltipProvider, which is reserved for copyable values (monospace +
 * nowrap). Workflow / delivery status glyphs are meaning text, not copy chips.
 */
export function IconWithTooltip({
  Icon,
  label,
  iconClassName,
  className,
}: IconWithTooltipProps) {
  return (
    <HoverTooltip
      label={label}
      focusable={false}
      className={cn('inline-flex cursor-default items-center', className)}
    >
      <span aria-label={label}>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClassName)} />
      </span>
    </HoverTooltip>
  );
}
