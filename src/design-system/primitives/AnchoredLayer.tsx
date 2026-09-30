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

/**
 * Which edge the panel's horizontal alignment is measured from.
 * Operator 2026-09-22: *"the drop down for the inbox on click must have no
 */
type AnchoredEdgeAlign = 'anchor' | 'viewport';

interface AnchoredLayerProps {
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
   * Keep the panel inside the viewport. Horizontally: clamp a top-/bottom-
   * panel that would overflow a side edge. Vertically: when the authored side
   * is too short for the panel and the opposite side has more room, flip to
   * it; either way publish the chosen side's room as
   * `--anchored-available-height` (Popover caps its height with it) and the
   * chosen side as `data-side`. When false, the panel sits exactly where the
   * placement puts it — no clamp, no flip — so a below-start panel cannot be
   * shoved over siblings (carton photos over Claim). Default true.
   */
  avoidCollisions?: boolean;
  /**
   * Force the panel to match the trigger's width. Always true for `*-stretch`
   * placements; opt-in for the others.
   */
  matchWidth?: boolean;
  /**
   * Measure horizontal alignment from the viewport edge instead of the
   * trigger's. Default `'anchor'`. See {@link AnchoredEdgeAlign}.
   */
  edgeAlign?: AnchoredEdgeAlign;
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

/** CSS custom property carrying the chosen side's room, in px — Popover caps its height with it. */
const AVAILABLE_HEIGHT_VAR = '--anchored-available-height';

interface VerticalFit {
  /** Opens on the side opposite the authored one. */
  flipped: boolean;
  /** Room on the chosen side, trigger gap and viewport gutter already taken out. */
  available: number;
}

/**
 * Pick the vertical side for a top-/bottom- panel: stay on the authored side
 * while the panel's natural height fits there; otherwise take the opposite
 * side when it has more room — never a sliver squeezed against an edge.
 * Once flipped it stays flipped while it still fits (or still has more room),
 * so a combobox list that shrinks as the operator types does not jump sides
 * under the cursor.
 */
function resolveVerticalFit(
  rect: DOMRect,
  placement: AnchoredPlacement,
  gap: number,
  naturalHeight: number,
  viewportHeight: number,
  wasFlipped: boolean,
): VerticalFit {
  const below = Math.max(0, viewportHeight - rect.bottom - gap - VIEWPORT_GUTTER_PX);
  const above = Math.max(0, rect.top - gap - VIEWPORT_GUTTER_PX);
  const prefersTop = placement.startsWith('top-');
  const preferred = prefersTop ? above : below;
  const opposite = prefersTop ? below : above;
  const flipped = wasFlipped
    ? naturalHeight <= opposite || opposite > preferred
    : naturalHeight > preferred && opposite > preferred;
  return { flipped, available: Math.floor(flipped ? opposite : preferred) };
}

/**
 * The panel's height with no available-height cap — drop the custom property,
 * read, restore. Synchronous inside a layout effect, so nothing paints between.
 */
function measureNaturalHeight(panel: HTMLElement): number {
  const capped = panel.style.getPropertyValue(AVAILABLE_HEIGHT_VAR);
  if (!capped) return panel.offsetHeight;
  panel.style.removeProperty(AVAILABLE_HEIGHT_VAR);
  const height = panel.offsetHeight;
  panel.style.setProperty(AVAILABLE_HEIGHT_VAR, capped);
  return height;
}

/** Where a vertical-edge (top-/bottom-) panel's LEFT wants to sit, in viewport coordinates, before any clamp — mirrors {@link… */
function intendedPanelLeft(
  rect: DOMRect,
  placement: AnchoredPlacement,
  panelWidth: number,
  edgeAlign: AnchoredEdgeAlign,
): number | null {
  if (!(placement.startsWith('top-') || placement.startsWith('bottom-'))) return null;
  if (placement.endsWith('-stretch')) return null;
  // A viewport-aligned panel is AT the edge on purpose — clamping it back to
  // `VIEWPORT_GUTTER_PX` would reinstate the gap it exists to remove.
  if (edgeAlign === 'viewport') return null;
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
  edgeAlign: AnchoredEdgeAlign,
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
    base.right = edgeAlign === 'viewport' ? 0 : Math.max(0, window.innerWidth - rect.right);
    if (matchWidth) base.width = rect.width;
  } else {
    base.left = edgeAlign === 'viewport' ? 0 : rect.left;
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
  edgeAlign = 'anchor',
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
  // Side + room for a top-/bottom- panel. Null = horizontal placement or
  // collisions off: position exactly as authored, uncapped.
  const [verticalFit, setVerticalFit] = useState<VerticalFit | null>(null);

  useEffect(() => {
    setTarget(document.body);
  }, []);

  // Claim keyboard ownership while open so ambient Escape owners (the outbound queue keyboard bridge, the right-rail inspector) stand down —…
  useRegisterOverlay(open);
  useEscapeClose(open && closeOnEscape, onClose);

  // Escape hatch (progressive-disclosure ladder, DESIGN_SYSTEM.md): closing
  // hands focus back to what opened the layer. Only when the close DROPPED
  // focus (it sat in the panel, which just unmounted): a click that moved
  // focus elsewhere keeps it there, and a combobox input that never lost
  // focus is untouched.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : anchorRef.current;
      return;
    }
    const opener = openerRef.current;
    openerRef.current = null;
    if (!opener?.isConnected) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    opener.focus({ preventScroll: true });
  }, [open, anchorRef]);

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

  // Horizontal viewport clamp.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !rect || !panel) {
      setClampLeft(null);
      return;
    }
    const width = panel.getBoundingClientRect().width;
    const intended = intendedPanelLeft(rect, placement, width, edgeAlign);
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
  }, [open, rect, placement, gap, avoidCollisions, edgeAlign]);

  // Vertical flip + available height. Re-fits when the panel resizes too —
  // options loading in after open can outgrow the authored side.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const vertical = placement.startsWith('top-') || placement.startsWith('bottom-');
    if (!open || !rect || !panel || !vertical || !avoidCollisions) {
      setVerticalFit(null);
      return;
    }
    const fit = () => {
      const naturalHeight = measureNaturalHeight(panel);
      setVerticalFit((prev) => {
        const next = resolveVerticalFit(
          rect,
          placement,
          gap,
          naturalHeight,
          window.innerHeight,
          prev?.flipped ?? false,
        );
        return prev?.flipped === next.flipped && prev.available === next.available ? prev : next;
      });
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(panel);
    return () => ro?.disconnect();
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

  const resolvedPlacement = verticalFit?.flipped
    ? ((placement.startsWith('top-')
        ? placement.replace('top-', 'bottom-')
        : placement.replace('bottom-', 'top-')) as AnchoredPlacement)
    : placement;
  const stretch = placement.endsWith('-stretch');
  const positioned = computeStyle(rect, resolvedPlacement, gap, matchWidth || stretch, level, edgeAlign);
  if (clampLeft != null) {
    // Replace whatever horizontal anchoring the placement chose with a concrete
    // clamped left, dropping the `right` / translateX(-50%) it may have used.
    positioned.left = clampLeft;
    delete positioned.right;
    if (positioned.transform === 'translateX(-50%)') delete positioned.transform;
  }
  const resolvedStyle = {
    ...positioned,
    ...(verticalFit ? { [AVAILABLE_HEIGHT_VAR]: `${verticalFit.available}px` } : null),
    ...style,
  } as CSSProperties;

  return createPortal(
    <div
      ref={panelRef}
      className={cn(className)}
      style={resolvedStyle}
      data-side={resolvedPlacement.split('-')[0]}
    >
      {children}
    </div>,
    target,
  );
}
