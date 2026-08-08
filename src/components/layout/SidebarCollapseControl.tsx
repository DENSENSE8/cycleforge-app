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
 *
 * The IconButton mount stays stable across peek open/close. Branching the
 * HoverTooltip wrapper on `peekOpen` remounted the button mid-press (180ms
 * openDelay) and dropped the click — first press only revealed the peek.
 */

import { useCallback, useRef, type FocusEvent } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, Popover } from '@/design-system/primitives';
import { useRailHoverPreview } from '@/components/sidebar/rail-shell/useRailHoverPreview';
import { TopDestinationPins } from '@/components/sidebar/master-nav/SpineTopPins';
import { warmSpineChunk } from '@/components/sidebar/preload-spine';
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

  /**
   * Warm the spine chunk the moment the pointer or focus reaches this button —
   * the precise tier of the prefetch (`preload-spine.ts`).
   *
   * The travel from "decides to open the nav" to "clicks" is usually the
   * ~300ms the fetch needs, so this alone makes most first opens land warm.
   * It is memoized and fire-and-forget, so crossing the button repeatedly
   * costs one fetch. `ResponsiveLayout`'s idle backstop covers the taps and
   * fast clicks that never generate a hover.
   *
   * Deliberately NOT gated on `peekEnabled`: that flag means "the spine is
   * currently collapsed", and while it happens to be true in the case we care
   * about, warming has nothing to do with the peek and should not inherit its
   * condition.
   */
  const onPointerEnter = useCallback(() => warmSpineChunk(), []);

  // Focus opens the peek for keyboard users; blur closes only when focus left
  // both the toggle and the popover (relatedTarget check).
  const onFocus = useCallback(() => {
    warmSpineChunk();
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

  // Noun = navigation (MasterNav spine) — not the context-rail "sidebar" that
  // owns ⌘B. Spine stays click-only; never advertise a layout chord here.
  const label = sidebarCollapsed ? 'Show navigation' : 'Hide navigation';

  return (
    <div
      ref={wrapRef}
      className={cn(HEADER_ICON_WRAP, '-ml-px')}
      {...(peekEnabled ? hoverProps : {})}
      data-testid="sidebar-collapse-control"
    >
      {/* Stable mount — peek disables the tooltip instead of unwrapping the
          button (unwrap remounted the trigger and ate mid-press clicks). */}
      <HoverTooltip label={label} asChild disabled={peekOpen}>
        <IconButton
          size="md"
          onClick={onToggle}
          onPointerEnter={onPointerEnter}
          onFocus={onFocus}
          onBlur={onBlur}
          ariaLabel={label}
          aria-pressed={!sidebarCollapsed}
          aria-expanded={peekOpen || !sidebarCollapsed}
          aria-haspopup={peekEnabled ? 'dialog' : undefined}
          className={HEADER_ICON_BTN_CLASS}
          icon={SidebarGlyph}
        />
      </HoverTooltip>

      {peekEnabled ? (
        <Popover
          open={peekOpen}
          onClose={dismiss}
          anchorRef={wrapRef}
          placement="bottom-start"
          gap={0}
          padded={false}
          aria-label="Quick destinations"
          className="w-auto min-w-0 border-t-0 p-0"
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
