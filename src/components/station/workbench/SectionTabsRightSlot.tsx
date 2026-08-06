/**
 * SectionTabsSlider right-slot primitives — controls beside the display strip.
 *
 * {@link SectionTabsRightTrack} remains for call sites that still want a
 * recessed pill cluster (e.g. Testing external-link when not on an icon rail).
 * Pairing/Edit-PO belongs on the Displays push (`openDisplays('linkage')`),
 * not a center-strip pencil twin.
 */

'use client';

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { operatorAccentClasses } from '@/utils/operator-accent';
import { cn } from '@/utils/_cn';

/** Light rail that matches TabSwitch `variant="solid"` chrome. */
export function SectionTabsRightTrack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-border-default bg-surface-card p-1 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Icon pill inside {@link SectionTabsRightTrack}. */
export function SectionTabsRightPill({
  label,
  active = false,
  filled = true,
  onClick,
  children,
  'aria-expanded': ariaExpanded,
}: {
  label: string;
  active?: boolean;
  /** When false, inactive state is text-only (pairing pencil parity). */
  filled?: boolean;
  onClick: () => void;
  children: ReactNode;
  'aria-expanded'?: boolean;
}) {
  return (
    <HoverTooltip label={label} placement="below" focusable={false} asChild>
      {/* ds-raw-button: HoverTooltip asChild Slot — IconButton would disturb the clone */}
      <button
        type="button"
        aria-label={label}
        aria-expanded={ariaExpanded}
        onClick={onClick}
        className={cn(
          'ds-raw-button flex h-8 w-8 items-center justify-center rounded-full transition-colors',
          active
            ? `${operatorAccentClasses.activePill} text-white`
            : filled
              ? 'text-text-muted hover:bg-surface-hover hover:text-text-default'
              : 'text-text-muted hover:text-text-default',
        )}
      >
        {children}
      </button>
    </HoverTooltip>
  );
}
