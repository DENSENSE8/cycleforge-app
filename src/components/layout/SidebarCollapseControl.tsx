'use client';

/**
 * GlobalHeader sidebar toggle — click opens/closes the MasterNav spine.
 *
 * When the spine is **collapsed**, hover (or focus) peeks Home · Search · Media
 * · Plans · Chat via {@link TopDestinationPins} so those destinations stay
 * reachable without opening the map. Click still opens the full spine. The peek
 * replaced the old 2s left-edge dwell (one corner, one hover answer).
 *
 * When the spine is **open**, this is a plain Hide control — pins already live
 * in the spine's 40px band (`SpineTopPins`).
 */

import { useCallback, useRef, type FocusEvent } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, Popover } from '@/design-system/primitives';
import { useRailHoverPreview } from '@/components/sidebar/rail-shell/useRailHoverPreview';
import { TopDestinationPins } from '@/components/sidebar/master-nav/SpineTopPins';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from './header-shell';

const SidebarGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={TOP_CHROME_ICON_GLYPH}
    aria-hidden
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

export function SidebarCollapseControl({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const peekEnabled = sidebarCollapsed;
  const {
    isOpen: peekOpen,
    hoverProps,
    scheduleOpen,
    scheduleClose,
    dismiss,
  } = useRailHoverPreview({
    enabled: peekEnabled,
    openDelay: 180,
    closeDelay: 160,
  });

  const onToggle = useCallback(() => {
    dismiss();
    onToggleSidebar();
  }, [dismiss, onToggleSidebar]);

  // Focus opens the peek for keyboard users; blur closes only when focus left
  // both the toggle and the popover (relatedTarget check).
  const onFocus = useCallback(() => {
    if (peekEnabled) scheduleOpen();
  }, [peekEnabled, scheduleOpen]);

  const onBlur = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const next = e.relatedTarget;
      if (next instanceof Node && wrapRef.current?.contains(next)) return;
      // Popover is portaled — relatedTarget may be inside the panel, which is
      // not a DOM descendant of wrapRef. Keep peek alive; panel blur / outside
      // click / Escape handle dismissal via Popover + hover leave.
      if (
        next instanceof Element &&
        next.closest('[data-testid="sidebar-top-pins-peek"]')
      ) {
        return;
      }
      scheduleClose();
    },
    [scheduleClose],
  );

  const label = sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar';

  const toggleButton = (
    <IconButton
      size="md"
      onClick={onToggle}
      onFocus={onFocus}
      onBlur={onBlur}
      ariaLabel={label}
      aria-pressed={!sidebarCollapsed}
      aria-expanded={peekOpen || !sidebarCollapsed}
      aria-haspopup={peekEnabled ? 'dialog' : undefined}
      className={HEADER_ICON_BTN_CLASS}
      icon={SidebarGlyph}
    />
  );

  return (
    <div
      ref={wrapRef}
      className={cn(HEADER_ICON_WRAP, '-ml-px')}
      {...(peekEnabled ? hoverProps : {})}
      data-testid="sidebar-collapse-control"
    >
      {/* Peek owns the hover face when open — skip the Show-sidebar tooltip so
          it does not stack under the pin row. */}
      {peekOpen ? (
        toggleButton
      ) : (
        <HoverTooltip label={label} asChild>
          {toggleButton}
        </HoverTooltip>
      )}

      {peekEnabled ? (
        <Popover
          open={peekOpen}
          onClose={dismiss}
          anchorRef={wrapRef}
          placement="bottom-start"
          gap={8}
          padded
          aria-label="Quick destinations"
          className="w-auto min-w-0 p-1"
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          data-testid="sidebar-top-pins-peek"
        >
          <TopDestinationPins layout="cluster" onPinNavigate={dismiss} />
        </Popover>
      ) : null}
    </div>
  );
}
