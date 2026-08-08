'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  clampPortalTooltipPosition,
  readTrustedTriggerRect,
  type PortalTooltipPlacement,
} from '@/lib/ui/portal-anchor';

/**
 * Lightweight hover/focus tooltip for plain meaning/help text.
 *
 * Renders the bubble in a body portal positioned from the trigger's rect, so it
 * is never clipped by an `overflow` container (e.g. a scrolling sidebar) and
 * appears instantly by default — unlike the native `title` attribute (slow,
 * unstyled) and unlike SiteTooltipProvider (which always shows a copy affordance).
 * Pass {@link openDelayMs} when the trigger sits on a transit path (e.g. a
 * resize-edge handle) so a cross-hover does not flash the label.
 *
 * The bubble is measured once mounted, then clamped to the viewport (8px margin)
 * and flipped above/below as needed, so it NEVER renders off the page. Untrusted
 * / near-origin anchors are rejected so the bubble cannot flash at the
 * viewport's top-left corner.
 */
export function HoverTooltip({
  label,
  children,
  className,
  focusable = true,
  asChild = false,
  placement = 'auto',
  openDelayMs = 0,
  disabled = false,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set false when the trigger sits inside another focusable control (e.g. a row button). */
  focusable?: boolean;
  /**
   * Attach the hover/focus handlers directly to the single child element instead
   * of wrapping it in a `<span>`. Use this when a wrapper span would disturb
   * flex/grid layout (e.g. a button that relies on parent `items-stretch`).
   * The child must be a single DOM element. Worst case if misused: the tooltip
   * doesn't show — never a layout or functional break.
   */
  asChild?: boolean;
  /**
   * Bubble placement relative to the trigger. `auto` prefers above and flips
   * below when there isn't room; `below` / `above` pin to that side (still
   * viewport-clamped).
   */
  placement?: PortalTooltipPlacement;
  /**
   * Dwell before showing on mouse enter. `0` (default) = instant. Focus still
   * shows immediately — keyboard users are not crossing the trigger.
   */
  openDelayMs?: number;
  /**
   * Suppress the bubble without remounting the trigger. Use when a sibling
   * surface (e.g. a hover peek) owns the hover face — swapping the tooltip
   * wrapper in/out remounts the child and can drop an in-flight click.
   */
  disabled?: boolean;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;
  // Trigger rect captured on open; the bubble is positioned off-screen+hidden
  // first so we can measure it, then clamped into view in the layout effect.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    if (disabled) return;
    // Ignore hidden / detached / off-viewport rects — otherwise the portal can
    // clamp to the viewport's top-left corner and look like a stray label
    // (e.g. SKU chip).
    const r = readTrustedTriggerRect(triggerRef.current);
    if (r) {
      setAnchor(r);
      setPos(null);
    }
  }, [disabled]);

  const hide = useCallback(() => {
    clearOpenTimer();
    setAnchor(null);
    setPos(null);
  }, [clearOpenTimer]);

  const scheduleShow = useCallback(() => {
    if (disabled) return;
    clearOpenTimer();
    if (openDelayMs <= 0) {
      show();
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      show();
    }, openDelayMs);
  }, [clearOpenTimer, disabled, openDelayMs, show]);

  // Tear down immediately when a sibling surface takes the hover face — do not
  // wait for mouseleave (the pointer often stays on the still-mounted trigger).
  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);

  useLayoutEffect(() => {
    if (!anchor || !bubbleRef.current) return;
    const b = bubbleRef.current.getBoundingClientRect();
    const next = clampPortalTooltipPosition({
      anchor,
      bubble: b,
      placement: placementRef.current,
    });
    // Keep hidden (pos null) when clamp rejects — never paint at ~(MARGIN,MARGIN)
    // from a bad/stale anchor.
    setPos(next);
  }, [anchor]);

  // Dismiss when the trigger unmounts, the pane scrolls, or the host panel
  // tears down — otherwise the body portal stays at a fixed viewport rect and
  // "leaks" over unrelated regions (e.g. condition pills over the notes tabs
  // after a mode switch or scroll in ReceivingLineWorkspace).
  useEffect(() => () => hide(), [hide]);

  useEffect(() => {
    if (!anchor) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [anchor, hide]);

  const bubble =
    anchor && typeof document !== 'undefined'
      ? createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="pointer-events-none z-tooltip max-w-[15rem] rounded-md bg-surface-inverse px-2 py-1 text-role-caption font-semibold leading-snug text-white shadow-lg whitespace-pre-line"
          >
            {label}
          </span>,
          document.body,
        )
      : null;

  // asChild: attach handlers to the single child element — no wrapper <span>, so
  // flex/grid layout is untouched. Falls back to the span wrapper if the child
  // isn't a valid element.
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<Record<string, unknown>>;
    const p = child.props;
    const compose =
      (theirs: unknown, ours: () => void) =>
      (e: unknown) => {
        if (typeof theirs === 'function') (theirs as (ev: unknown) => void)(e);
        ours();
      };
    const childRef = (p as { ref?: unknown }).ref;
    const setRef = (node: HTMLElement | null) => {
      triggerRef.current = node;
      if (typeof childRef === 'function') (childRef as (n: unknown) => void)(node);
      else if (childRef && typeof childRef === 'object') {
        (childRef as { current: unknown }).current = node;
      }
    };
    return (
      <>
        {cloneElement(child, {
          ref: setRef,
          onMouseEnter: compose(p.onMouseEnter, scheduleShow),
          onMouseLeave: compose(p.onMouseLeave, hide),
          ...(focusable
            ? { onFocus: compose(p.onFocus, show), onBlur: compose(p.onBlur, hide) }
            : null),
        } as Record<string, unknown>)}
        {bubble}
      </>
    );
  }

  return (
    <span
      ref={triggerRef}
      className={className}
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={focusable ? show : undefined}
      onBlur={focusable ? hide : undefined}
      tabIndex={focusable ? 0 : undefined}
    >
      {children}
      {bubble}
    </span>
  );
}
