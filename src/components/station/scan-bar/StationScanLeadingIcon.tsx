'use client';

import type { ComponentType, SVGProps } from 'react';
import { STATION_SCAN_BAR_DEFAULT_ICON_CLASS } from './tokens';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface StationScanLeadingIconProps {
  Icon: IconComponent;
  tintClassName?: string;
  ariaLabel: string;
  title: string;
  /**
   * Click / activate focuses the scan input (wired by {@link StationScanBar}).
   * When omitted, the glyph stays a non-interactive status mark.
   */
  onActivate?: () => void;
}

/** Left indicator glyph — always uses the shared icon box geometry. */
export function StationScanLeadingIcon({
  Icon,
  tintClassName = 'text-text-faint',
  ariaLabel,
  title,
  onActivate,
}: StationScanLeadingIconProps) {
  const glyph = (
    <Icon className={`${STATION_SCAN_BAR_DEFAULT_ICON_CLASS} transition-colors`} />
  );

  if (onActivate) {
    return (
      <HoverTooltip label={title} asChild>
        <button
          type="button"
          onClick={onActivate}
          aria-label={ariaLabel}
          className={cn(
            'ds-raw-button',
            'flex items-center justify-center',
            tintClassName,
          )}
        >
          {glyph}
        </button>
      </HoverTooltip>
    );
  }

  return (
    <HoverTooltip label={title} asChild focusable={false}>
      <span
        className={`flex items-center justify-center ${tintClassName}`}
        role="status"
        aria-label={ariaLabel}
      >
        {glyph}
      </span>
    </HoverTooltip>
  );
}
