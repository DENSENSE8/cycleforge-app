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

const MARGIN = 8;

/**
 * Lightweight hover/focus tooltip for plain meaning/help text.
 *
 * Renders the bubble in a body portal positioned from the trigger's rect, so it
 * is never clipped by an `overflow` container (e.g. a scrolling sidebar) and
 * appears instantly — unlike the native `title` attribute (slow, unstyled) and
 * unlike SiteTooltipProvider (which always shows a copy affordance).
 *
 * The bubble is measured once mounted, then clamped to the viewport (8px margin)
 * and flipped above/below as needed, so it NEVER renders off the page.
 */
export function HoverTooltip({
  label,
  children,
  className,
  focusable = true,
  asChild = false,
  placement = 'auto',
}: {
  label: string;
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
  placement?: 'auto' | 'above' | 'below';
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;
  // Trigger rect captured on open; the bubble is positioned off-screen+hidden
  // first so we can measure it, then clamped into view in the layout effect.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    // Ignore zero-size / detached rects — otherwise the portal can clamp to the
    // viewport's top-left corner and look like a stray label (e.g. SKU chip).
    if (r && r.width >= 2 && r.height >= 2) {
      setAnchor(r);
      setPos(null);
    }
  }, []);
  const hide = useCallback(() => {
    setAnchor(null);
    setPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!anchor || anchor.width < 2 || anchor.height < 2 || !bubbleRef.current) return;
    const b = bubbleRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const roomAbove = anchor.top - MARGIN;
    const roomBelow = vh - anchor.bottom - MARGIN;
    const side = placementRef.current;
    let rawTop: number;
    if (side === 'below') {
      rawTop = anchor.bottom + MARGIN;
    } else if (side === 'above') {
      rawTop = anchor.top - b.height - MARGIN;
    } else {
      // Prefer above the trigger; flip below when there isn't room above.
      const preferAbove = roomAbove >= b.height || roomAbove > roomBelow;
      rawTop = preferAbove ? anchor.top - b.height - MARGIN : anchor.bottom + MARGIN;
    }
    const top = Math.min(Math.max(rawTop, MARGIN), Math.max(MARGIN, vh - b.height - MARGIN));

    // Center on the trigger, then clamp horizontally into the viewport.
    const rawLeft = anchor.left + anchor.width / 2 - b.width / 2;
    const left = Math.min(Math.max(rawLeft, MARGIN), Math.max(MARGIN, vw - b.width - MARGIN));

    setPos({ top, left });
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
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="pointer-events-none fixed z-tooltip max-w-[15rem] rounded-md bg-surface-inverse px-2 py-1 text-role-caption font-semibold leading-snug text-white shadow-lg"
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
          onMouseEnter: compose(p.onMouseEnter, show),
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
      onMouseEnter={show}
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
