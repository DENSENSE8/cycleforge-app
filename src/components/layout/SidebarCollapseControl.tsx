'use client';

/**
 * GlobalHeader sidebar toggle — the ONE door onto the MasterNav spine while
 * the spine is closed. Open, {@link SpineNavChrome} paints the same glyph at
 * the same screen corner.
 */

import { useCallback } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { warmSpineChunk } from '@/components/sidebar/preload-spine';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';
import { cn } from '@/utils/_cn';

const SidebarGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={TOP_CHROME_ICON_FACE}
    aria-hidden
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

export function SidebarCollapseControl({
  navOpen,
  onToggleNav,
  peeking = false,
  peekTriggerProps,
}: {
  navOpen: boolean;
  onToggleNav: () => void;
  peeking?: boolean;
  peekTriggerProps?: { onMouseEnter?: () => void; onMouseLeave?: () => void };
}) {
  const onPointerEnter = useCallback(() => {
    warmSpineChunk();
  }, []);
  const onMouseLeave = useCallback(() => {
    peekTriggerProps?.onMouseLeave?.();
  }, [peekTriggerProps]);
  const onFocus = useCallback(() => warmSpineChunk(), []);

  const label = navOpen ? 'Hide navigation' : 'Show navigation';

  return (
    <div
      className={HEADER_ICON_WRAP}
      data-testid="sidebar-collapse-control"
      onMouseLeave={onMouseLeave}
    >
      <HoverTooltip label={label} asChild disabled={peeking}>
        <IconButton
          size="md"
          onClick={onToggleNav}
          onPointerEnter={onPointerEnter}
          onFocus={onFocus}
          ariaLabel={label}
          aria-pressed={navOpen}
          aria-expanded={navOpen || peeking}
          className={cn(HEADER_ICON_BTN_CLASS, (navOpen || peeking) && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={SidebarGlyph}
        />
      </HoverTooltip>
    </div>
  );
}
