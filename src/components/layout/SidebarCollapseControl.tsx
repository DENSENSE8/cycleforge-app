'use client';

/**
 * GlobalHeader sidebar toggle — click pins/unpins the MasterNav spine.
 *
 * When the spine is collapsed, hover peeks a miniaturized overlay of the
 * live nav (same rows as the pinned column). Click pins the full push
 * column. Hover/focus still warms the spine chunk so the first open lands warm.
 */

import { useCallback } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { warmSpineChunk } from '@/components/sidebar/preload-spine';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

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
  sidebarCollapsed,
  onToggleSidebar,
  peeking = false,
  peekTriggerProps,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  /** Miniaturized overlay is visible — suppress the tooltip so it does not stack. */
  peeking?: boolean;
  peekTriggerProps?: {
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
  };
}) {
  const onPointerEnter = useCallback(() => {
    warmSpineChunk();
    peekTriggerProps?.onMouseEnter?.();
  }, [peekTriggerProps]);
  const onMouseLeave = useCallback(() => {
    peekTriggerProps?.onMouseLeave?.();
  }, [peekTriggerProps]);
  const onFocus = useCallback(() => warmSpineChunk(), []);

  // Noun = navigation (MasterNav spine) — not the context-rail "sidebar" that
  // owns ⌘B. Never advertise a layout chord here.
  // Not show/hide: there is no hidden state any more (2026-09-05). The toggle
  // moves the spine between its remembered width and the 48px icon rail, and
  // the label has to say which, or it promises a disappearance that no longer
  // happens.
  const label = sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation';

  return (
    <div
      className={cn(HEADER_ICON_WRAP, '-ml-px')}
      data-testid="sidebar-collapse-control"
      onMouseLeave={onMouseLeave}
    >
      <HoverTooltip label={label} asChild disabled={peeking}>
        <IconButton
          size="md"
          onClick={onToggleSidebar}
          onPointerEnter={onPointerEnter}
          onFocus={onFocus}
          ariaLabel={label}
          aria-pressed={!sidebarCollapsed}
          aria-expanded={!sidebarCollapsed || peeking}
          className={HEADER_ICON_BTN_CLASS}
          icon={SidebarGlyph}
        />
      </HoverTooltip>
    </div>
  );
}
