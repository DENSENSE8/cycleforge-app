'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  clampPortalTooltipPosition,
  readTrustedTriggerRect,
  type PortalTooltipPlacement,
} from '@/lib/ui/portal-anchor';
import { motionDurations } from '@/design-system/foundations/motion';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { useCursorLabel } from '@/design-system/motion/use-cursor-label';
import {
  useDeferredHoverEngine,
  useDeferredHoverMount,
  type DeferredHoverBridge,
} from '@/components/ui/deferred-hover-mount';
import { cn } from '@/utils/_cn';

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
 *
 * ## Deferred machinery
 *
 * Everything above is the BUBBLE's job, and a bubble cannot exist before a
 * pointer or a focus ring arrives. So this component is only the trigger shell —
 * two hooks, no effects — and {@link HoverTooltipBubble} (timers, portal, rect
 * clamp, scroll teardown: 12 more hooks) mounts on the first activating
 * interaction and stays mounted, via {@link useDeferredHoverMount}. That first
 * interaction is carried in, so the hover that pays for the mount is the hover
 * that shows the label.
 *
 * This is invisible to the 350+ call sites: the trigger DOM, the props, and the
 * bubble's behavior are unchanged. The tooltip is never in the DOM before it
 * opens — it was not before this split either — so no accessible name or
 * description moves.
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
  chrome = 'inverse',
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
   * below when there isn't room; `below` / `above` / `right` / `left` pin to
   * that side (still viewport-clamped; side tips flip when the pinned side
   * cannot seat the bubble).
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
  /**
   * `inverse` — dark help chip. `plain` — no outer chrome (product cards);
   * enter/exit fade+zoom from the trigger (`transform-origin` on the icon).
   */
  chrome?: 'inverse' | 'plain';
}) {
  const { mounted, triggerRef, bridge, activate, release } = useDeferredHoverMount<
    HTMLElement,
    HoverTooltipHandle
  >();
  // Desk: the cursor follower carries it. Anywhere else: the anchored bubble.
  // `plain` chrome keeps its anchored fade+zoom presentation — the follower
  // only speaks the inverse help chip.
  const cursor = useCursorLabel({ disabled });

  const onEnter = () => {
    if (disabled) return;
    if (chrome === 'inverse' && cursor.enter(label, openDelayMs)) return;
    activate('hover', (h) => h.scheduleShow());
  };
  const onFocusTrigger = () => {
    if (disabled) return;
    // Click-focus while the cursor already carries the label: one copy only.
    // Keyboard focus with no hover still gets the bubble.
    if (cursor.riding()) return;
    activate('focus', (h) => h.show());
  };
  const dismiss = () => {
    cursor.leave();
    release((h) => h.hide());
  };

  const bubble = mounted ? (
    <HoverTooltipBubble
      bridge={bridge}
      triggerRef={triggerRef}
      label={label}
      placement={placement}
      openDelayMs={openDelayMs}
      disabled={disabled}
      chrome={chrome}
    />
  ) : null;

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
          onMouseEnter: compose(p.onMouseEnter, onEnter),
          onMouseLeave: compose(p.onMouseLeave, dismiss),
          ...(focusable
            ? {
                onFocus: compose(p.onFocus, onFocusTrigger),
                onBlur: compose(p.onBlur, dismiss),
              }
            : null),
        } as Record<string, unknown>)}
        {bubble}
      </>
    );
  }

  return (
    <span
      ref={triggerRef as MutableRefObject<HTMLSpanElement | null>}
      className={className}
      onMouseEnter={onEnter}
      onMouseLeave={dismiss}
      onFocus={focusable ? onFocusTrigger : undefined}
      onBlur={focusable ? dismiss : undefined}
      tabIndex={focusable ? 0 : undefined}
    >
      {children}
      {bubble}
    </span>
  );
}

/** What the trigger shell may ask of a mounted bubble. */
type HoverTooltipHandle = {
  /** Immediate — focus, and the `openDelayMs === 0` hover path. */
  show: () => void;
  scheduleShow: () => void;
  hide: () => void;
};

/**
 * The bubble machinery. Mounted only after the first hover/focus, then kept —
 * so its timers, portal and scroll listener exist once per *reached* trigger
 * rather than once per painted row.
 */
function HoverTooltipBubble({
  bridge,
  triggerRef,
  label,
  placement,
  openDelayMs,
  disabled,
  chrome,
}: {
  bridge: DeferredHoverBridge<HoverTooltipHandle>;
  triggerRef: MutableRefObject<HTMLElement | null>;
  label: ReactNode;
  placement: PortalTooltipPlacement;
  openDelayMs: number;
  disabled: boolean;
  chrome: 'inverse' | 'plain';
}) {
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;
  // Trigger rect captured on open; the bubble is positioned off-screen+hidden
  // first so we can measure it, then clamped into view in the layout effect.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [leaving, setLeaving] = useState(false);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current != null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    if (disabled) return;
    clearLeaveTimer();
    setLeaving(false);
    // Ignore hidden / detached / off-viewport rects — otherwise the portal can
    // clamp to the viewport's top-left corner and look like a stray label
    // (e.g. SKU chip).
    const r = readTrustedTriggerRect(triggerRef.current);
    if (r) {
      setAnchor(r);
      setPos(null);
    }
  }, [clearLeaveTimer, disabled, triggerRef]);

  const posRef = useRef(pos);
  posRef.current = pos;
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;

  const dismissNow = useCallback(() => {
    clearOpenTimer();
    clearLeaveTimer();
    setLeaving(false);
    setAnchor(null);
    setPos(null);
  }, [clearLeaveTimer, clearOpenTimer]);

  const hide = useCallback(() => {
    clearOpenTimer();
    if (chromeRef.current === 'plain' && posRef.current && !leavingRef.current) {
      setLeaving(true);
      clearLeaveTimer();
      leaveTimerRef.current = window.setTimeout(() => {
        leaveTimerRef.current = null;
        setAnchor(null);
        setPos(null);
        setLeaving(false);
      }, Number.parseInt(motionDurations.fast, 10));
      return;
    }
    if (chromeRef.current === 'plain' && leavingRef.current) return;
    dismissNow();
  }, [clearLeaveTimer, clearOpenTimer, dismissNow]);

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

  // Publish the handle, then act on the interaction that mounted us — the whole
  // point of the split is that the FIRST hover still shows a label. `readIntent`
  // is non-destructive, so a StrictMode remount re-applies it instead of
  // swallowing it; the trigger's `release` is what clears it.
  useDeferredHoverEngine(bridge, { show, hide, scheduleShow }, (intent, h) => {
    if (intent === 'focus') h.show();
    else h.scheduleShow();
  });

  // Tear down immediately when a sibling surface takes the hover face — do not
  // wait for mouseleave (the pointer often stays on the still-mounted trigger).
  useEffect(() => {
    if (disabled) dismissNow();
  }, [disabled, dismissNow]);

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
    if (!next) {
      setPos(null);
      return;
    }
    const bw = Math.max(b.width, 1);
    const bh = Math.max(b.height, 1);
    setPos({
      top: next.top,
      left: next.left,
      originX: Math.max(0, Math.min(100, ((anchor.left + anchor.width / 2 - next.left) / bw) * 100)),
      originY: Math.max(0, Math.min(100, ((anchor.top + anchor.height / 2 - next.top) / bh) * 100)),
    });
  }, [anchor]);

  // Dismiss when the trigger unmounts, the pane scrolls, or the host panel
  // tears down — otherwise the body portal stays at a fixed viewport rect and
  // "leaks" over unrelated regions (e.g. condition pills over the notes tabs
  // after a mode switch or scroll in ReceivingLineWorkspace).
  useEffect(
    () => () => {
      clearOpenTimer();
      clearLeaveTimer();
    },
    [clearLeaveTimer, clearOpenTimer],
  );

  useEffect(() => {
    if (!anchor) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [anchor, hide]);

  if (!anchor || typeof document === 'undefined') return null;

  const measureSpan = (
    <span
      ref={bubbleRef}
      aria-hidden
      style={{ position: 'fixed', top: -9999, left: -9999, visibility: 'hidden' }}
      className="pointer-events-none"
    >
      {label}
    </span>
  );

  if (chrome === 'plain') {
    return createPortal(
      <>
        {measureSpan}
        {pos ? (
          <span
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transformOrigin: `${pos.originX}% ${pos.originY}%`,
              animationDuration: motionDurations.fast,
            }}
            className={cn(
              'pointer-events-none z-tooltip',
              leaving
                ? 'animate-out fade-out-0 zoom-out-95 fill-mode-forwards'
                : 'animate-in fade-in-0 zoom-in-95',
            )}
          >
            {label}
          </span>
        ) : null}
      </>,
      document.body,
    );
  }

  return createPortal(
    <span
      ref={bubbleRef}
      role="tooltip"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={cn(
        'pointer-events-none z-tooltip max-w-[15rem] bg-surface-inverse px-2 py-1 text-role-caption font-semibold leading-snug text-white shadow-lg whitespace-pre-line',
        // Same 8px popover rung as the cursor-follow chip — one corner for
        // the hover hint wherever it lands (operator 2026-09-15). The ROLE
        // ladder renders rounded-none in this theme's industrial wave.
        DROPDOWN_SHELL_CORNER,
      )}
    >
      {label}
    </span>,
    document.body,
  );
}
