'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/_cn';
import { useEscapeClose, useRegisterOverlay } from '@/design-system/hooks';
import { zIndex, type ZIndexToken } from '@/design-system/tokens/z-index';

// ─── AnchoredLayer ───────────────────────────────────────────────────────────
//
// The canonical building block for an ANCHORED popover/dropdown/menu — anything
// that opens positioned relative to a trigger element and participates in the
// global stacking order.
//
// It is the anchored sibling of <Layer>. Where <Layer> portals a full-screen /
// centered overlay, AnchoredLayer:
//   1. Portals its panel to <body> so a high z-index can never be trapped by an
//      ancestor that established a stacking context (transform, filter,
//      backdrop-filter, will-change, perspective, contain) — the bug that makes
//      an in-flow `absolute top-full z-dropdown` silently render behind a panel.
//   2. Tracks the trigger's on-screen rect (getBoundingClientRect +
//      ResizeObserver + scroll/resize) and pins the panel to the chosen
//      `placement`, so it follows the trigger exactly like the old
//      `absolute top-full` did — modelled on RightPaneOverlay's rect tracking.
//   3. Owns dismissal: Escape + outside-click that accounts for BOTH the anchor
//      and the (now-portaled) panel — so callers can delete their bespoke
//      `rootRef.contains(target)` handlers, which would otherwise misfire once
//      the panel left the trigger's DOM subtree.
//
// It owns no visual chrome (no backdrop/scroll-lock/motion); compose those in
// the panel children. z-index defaults to `dropdown` — the band these anchored
// menus belong to (open in normal page flow, never over a slide-over panel).
//
// Usage:
//   const triggerRef = useRef<HTMLButtonElement>(null);
//   <button ref={triggerRef} onClick={() => setOpen(o => !o)} />
//   <AnchoredLayer open={open} onClose={() => setOpen(false)}
//                  anchorRef={triggerRef} placement="bottom-stretch">
//     …menu…
//   </AnchoredLayer>

export type AnchoredPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'bottom-center'
  | 'bottom-stretch'
  | 'top-start'
  | 'top-end'
  | 'top-center'
  | 'top-stretch'
  | 'right-start'
  | 'right-end'
  | 'right-center'
  | 'left-start'
  | 'left-end'
  | 'left-center';

export interface AnchoredLayerProps {
  open: boolean;
  onClose: () => void;
  /** Trigger element the panel is positioned against. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Edge + alignment of the panel relative to the trigger. Default 'bottom-start'. */
  placement?: AnchoredPlacement;
  /** Stacking band. Default 'dropdown'. */
  level?: ZIndexToken;
  /** Gap in px between the trigger edge and the panel. Default 4. */
  gap?: number;
  /**
   * When false, skip the horizontal viewport clamp so a below-start panel
   * cannot be shoved left over siblings (carton photos over Claim). Default true.
   */
  avoidCollisions?: boolean;
  /**
   * Force the panel to match the trigger's width. Always true for `*-stretch`
   * placements; opt-in for the others.
   */
  matchWidth?: boolean;
  /** Close on Escape. Default true. */
  closeOnEscape?: boolean;
  /**
   * A click whose target matches this selector (via `closest`) is NOT treated as
   * "outside" — for content that itself portals out of the panel (e.g. a Radix
   * popper / calendar rendered inside the menu).
   */
  ignoreClickSelector?: string;
  /** Classes on the portaled positioning wrapper. */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Breathing room kept between a clamped panel and the viewport edge. */
const VIEWPORT_GUTTER_PX = 8;

/**
 * Where a vertical-edge (top-/bottom-) panel's LEFT wants to sit, in viewport
 * coordinates, before any clamp — mirrors {@link computeStyle}'s horizontal
 * alignment. Returns null for placements the clamp does not own (stretch and
 * the left-/right-edge placements, which anchor against a viewport edge already).
 */
function intendedPanelLeft(
  rect: DOMRect,
  placement: AnchoredPlacement,
  panelWidth: number,
): number | null {
  if (!(placement.startsWith('top-') || placement.startsWith('bottom-'))) return null;
  if (placement.endsWith('-stretch')) return null;
  if (placement.endsWith('-center')) return rect.left + rect.width / 2 - panelWidth / 2;
  if (placement.endsWith('-end')) return rect.right - panelWidth;
  return rect.left; // -start
}

function computeStyle(
  rect: DOMRect,
  placement: AnchoredPlacement,
  gap: number,
  matchWidth: boolean,
  level: ZIndexToken,
): CSSProperties {
  const stretch = placement.endsWith('-stretch');
  const isRight = placement.startsWith('right-');
  const isLeft = placement.startsWith('left-');
  const isTop = placement.startsWith('top-');
  const base: CSSProperties = { position: 'fixed', zIndex: zIndex[level] };

  // Horizontal-edge placements (right / left of the trigger).
  if (isRight || isLeft) {
    if (isRight) {
      base.left = rect.right + gap;
    } else {
      base.right = Math.max(0, window.innerWidth - rect.left + gap);
    }
    // Vertical alignment along the trigger.
    if (placement.endsWith('-center')) {
      base.top = rect.top + rect.height / 2;
      base.transform = 'translateY(-50%)';
    } else if (placement.endsWith('-end')) {
      base.bottom = Math.max(0, window.innerHeight - rect.bottom);
    } else {
      // *-start — align to the trigger's top.
      base.top = rect.top;
    }
    if (matchWidth) base.width = rect.width;
    return base;
  }

  // Vertical edge (top / bottom of the trigger).
  if (isTop) {
    base.bottom = Math.max(0, window.innerHeight - rect.top + gap);
  } else {
    base.top = rect.bottom + gap;
  }

  // Horizontal alignment.
  if (stretch) {
    base.left = rect.left;
    base.width = rect.width;
  } else if (placement.endsWith('-center')) {
    base.left = rect.left + rect.width / 2;
    base.transform = 'translateX(-50%)';
  } else if (placement.endsWith('-end')) {
    base.right = Math.max(0, window.innerWidth - rect.right);
    if (matchWidth) base.width = rect.width;
  } else {
    base.left = rect.left;
    if (matchWidth) base.width = rect.width;
  }

  return base;
}

export function AnchoredLayer({
  open,
  onClose,
  anchorRef,
  placement = 'bottom-start',
  level = 'dropdown',
  gap = 4,
  avoidCollisions = true,
  matchWidth = false,
  closeOnEscape = true,
  ignoreClickSelector,
  className,
  style,
  children,
}: AnchoredLayerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  // When a vertical-edge panel would overflow the viewport horizontally, the
  // clamped left it should sit at instead. Null = fits, position as authored.
  const [clampLeft, setClampLeft] = useState<number | null>(null);

  useEffect(() => {
    setTarget(document.body);
  }, []);

  // Claim keyboard ownership while open so ambient Escape owners (the outbound
  // queue keyboard bridge, the right-rail inspector) stand down — otherwise the
  // capture-phase queue listener closes the inspector and this panel stays up.
  // See `src/lib/overlay-stack/store.ts`.
  useRegisterOverlay(open);
  useEscapeClose(open && closeOnEscape, onClose);

  // Track the trigger rect so the portaled panel follows it. useLayoutEffect
  // measures before paint so the panel never flashes at (0,0) first.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!open || !anchor) {
      setRect(null);
      return;
    }
    const measure = () => setRect(anchor.getBoundingClientRect());
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(anchor);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, anchorRef]);

  // Horizontal viewport clamp. A wide panel anchored `*-end` / `*-center` from a
  // trigger near the left/center of the work surface (e.g. an in-row Link on the
  // Unbox capture strip) would otherwise render its left edge past the viewport
  // / under chrome. Measure the panel and, ONLY when it overflows, pin a clamped
  // left. useLayoutEffect runs before paint, so the correction is flash-free; a
  // panel that already fits gets `null` and positions exactly as before, so no
  // existing menu moves. Vertical-edge placements only — the left/right-edge and
  // stretch placements anchor against an edge already.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !rect || !panel) {
      setClampLeft(null);
      return;
    }
    const width = panel.getBoundingClientRect().width;
    const intended = intendedPanelLeft(rect, placement, width);
    if (!avoidCollisions || intended == null) {
      setClampLeft(null);
      return;
    }
    const maxLeft = Math.max(
      VIEWPORT_GUTTER_PX,
      window.innerWidth - width - VIEWPORT_GUTTER_PX,
    );
    const clamped = Math.min(Math.max(intended, VIEWPORT_GUTTER_PX), maxLeft);
    // Only override when we actually moved it — sub-pixel jitter is not overflow.
    setClampLeft(Math.abs(clamped - intended) > 0.5 ? clamped : null);
  }, [open, rect, placement, gap, avoidCollisions]);

  // Outside-click that accounts for the (portaled) panel AND the anchor, so a
  // click inside either is not treated as "outside". Replaces each caller's
  // own rootRef.contains() handler, which can't see the portaled panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const node = event.target as Node | null;
      if (!node) return;
      if (panelRef.current?.contains(node)) return;
      if (anchorRef.current?.contains(node)) return;
      if (
        ignoreClickSelector &&
        node instanceof Element &&
        node.closest(ignoreClickSelector)
      )
        return;
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onClose, anchorRef, ignoreClickSelector]);

  if (!open || !target || !rect) return null;

  const stretch = placement.endsWith('-stretch');
  const positioned = computeStyle(rect, placement, gap, matchWidth || stretch, level);
  if (clampLeft != null) {
    // Replace whatever horizontal anchoring the placement chose with a concrete
    // clamped left, dropping the `right` / translateX(-50%) it may have used.
    positioned.left = clampLeft;
    delete positioned.right;
    if (positioned.transform === 'translateX(-50%)') delete positioned.transform;
  }
  const resolvedStyle = {
    ...positioned,
    ...style,
  };

  return createPortal(
    <div ref={panelRef} className={cn(className)} style={resolvedStyle}>
      {children}
    </div>,
    target,
  );
}
