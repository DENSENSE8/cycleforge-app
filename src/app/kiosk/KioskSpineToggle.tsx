'use client';

/**
 * Kiosk mode-spine open/close — lives in the **pane header** (Catalog, or
 * Pickup detail when Catalog is hidden), never inside the spine column.
 * Same placement grammar as staff `SidebarCollapseControl` in GlobalHeader.
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';

const SidebarGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

export function KioskSpineToggle({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
}) {
  const label = expanded ? 'Collapse service menu' : 'Expand service menu';
  return (
    <HoverTooltip label={label} asChild>
      <IconButton
        icon={SidebarGlyph}
        ariaLabel={label}
        size="touch"
        tone="neutral"
        aria-pressed={expanded}
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        className="shrink-0 hover:bg-surface-hover"
        data-testid="kiosk-spine-toggle"
      />
    </HoverTooltip>
  );
}
