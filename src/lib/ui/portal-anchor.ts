/**
 * Shared trust + clamp math for body-portaled tooltips / menus.
 *
 * Bad or near-origin trigger rects used to survive a size-only check, then
 * viewport clamp pinned the bubble to ~(MARGIN, MARGIN) — a stray top-left
 * flash before a later remeasure. Trust the rect first; only then clamp.
 *
 * Two placement families:
 *   • {@link clampPortalTooltipPosition} — above/below/right/left (read-only tips).
 *   • {@link clampPortalSideMenuPosition} — end/start side flyouts for dense
 *     table hover menus (clears the vertical row-scan path).
 */

export const PORTAL_TOOLTIP_MARGIN = 8;
/** Default gap between a side-menu trigger and its portal panel. */
export const PORTAL_SIDE_MENU_GAP = 4;
const PORTAL_ANCHOR_MIN_PX = 2;

type PortalRect = Pick<DOMRect, 'width' | 'height' | 'top' | 'left' | 'bottom' | 'right'>;

type PortalViewport = { width: number; height: number };

export type PortalTooltipPlacement = 'auto' | 'above' | 'below' | 'right' | 'left';

/**
 * Horizontal side for dense-table hover menus (LTR).
 * `end` = trailing/right; `start` = leading/left; `auto` prefers end and flips.
 */
export type PortalSideMenuPlacement = 'auto' | 'end' | 'start';

export type PortalSideMenuAlign = 'start' | 'center' | 'end';

/** Read viewport size (injectable for tests). */
function readPortalViewport(
  win: Pick<Window, 'innerWidth' | 'innerHeight'> | null | undefined = typeof window !== 'undefined'
    ? window
    : null,
): PortalViewport {
  return { width: win?.innerWidth ?? 0, height: win?.innerHeight ?? 0 };
}

/**
 * True when a getBoundingClientRect() result is safe to place a body portal from.
 * Rejects null, near-zero size, and fully off-viewport rects — those clamp to
 * the viewport's top-left margin and flash as a stray label.
 */
export function isTrustedPortalAnchor(
  rect: PortalRect | null | undefined,
  viewport: PortalViewport = readPortalViewport(),
): boolean {
  if (!rect) return false;
  if (rect.width < PORTAL_ANCHOR_MIN_PX || rect.height < PORTAL_ANCHOR_MIN_PX) return false;
  if (viewport.width < 1 || viewport.height < 1) return false;
  // Fully outside the viewport (no visible overlap).
  if (rect.bottom <= 0 || rect.right <= 0) return false;
  if (rect.top >= viewport.height || rect.left >= viewport.width) return false;
  return true;
}

/**
 * Trigger element is connected and not display/visibility-hidden, with a
 * trusted on-screen rect. Prefer this when the DOM node is in hand.
 */
export function readTrustedTriggerRect(
  el: HTMLElement | null | undefined,
  viewport: PortalViewport = readPortalViewport(),
  getStyle: (node: Element) => CSSStyleDeclaration = (node) => window.getComputedStyle(node),
): DOMRect | null {
  if (!el?.isConnected) return null;
  const style = getStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return null;
  const rect = el.getBoundingClientRect();
  return isTrustedPortalAnchor(rect, viewport) ? rect : null;
}

/**
 * Clamp a tooltip bubble to the viewport relative to a trusted anchor.
 * Returns null (keep portal hidden) when the anchor is untrusted or when clamp
 * would pin the tip to the top-left margin while the trigger is elsewhere —
 * the classic top-left flash.
 */
export function clampPortalTooltipPosition(args: {
  anchor: PortalRect;
  bubble: Pick<DOMRect, 'width' | 'height'>;
  viewport?: PortalViewport;
  placement?: PortalTooltipPlacement;
  margin?: number;
}): { top: number; left: number } | null {
  const margin = args.margin ?? PORTAL_TOOLTIP_MARGIN;
  const viewport = args.viewport ?? readPortalViewport();
  const placement = args.placement ?? 'auto';
  const { anchor, bubble } = args;

  if (!isTrustedPortalAnchor(anchor, viewport)) return null;
  if (bubble.width < PORTAL_ANCHOR_MIN_PX || bubble.height < PORTAL_ANCHOR_MIN_PX) return null;

  const vw = viewport.width;
  const vh = viewport.height;

  const roomAbove = anchor.top - margin;
  const roomBelow = vh - anchor.bottom - margin;
  const roomRight = vw - anchor.right - margin;
  const roomLeft = anchor.left - margin;

  let rawTop: number;
  let rawLeft: number;

  if (placement === 'right' || placement === 'left') {
    // Side tip — vertically center on the trigger; prefer the pinned side and
    // flip only when that side cannot seat the bubble.
    rawTop = anchor.top + anchor.height / 2 - bubble.height / 2;
    const preferRight =
      placement === 'right'
        ? roomRight >= bubble.width || roomRight >= roomLeft
        : roomLeft < bubble.width && roomRight >= roomLeft;
    rawLeft = preferRight
      ? anchor.right + margin
      : anchor.left - bubble.width - margin;
  } else if (placement === 'below') {
    rawTop = anchor.bottom + margin;
    rawLeft = anchor.left + anchor.width / 2 - bubble.width / 2;
  } else if (placement === 'above') {
    rawTop = anchor.top - bubble.height - margin;
    rawLeft = anchor.left + anchor.width / 2 - bubble.width / 2;
  } else {
    const preferAbove = roomAbove >= bubble.height || roomAbove > roomBelow;
    rawTop = preferAbove ? anchor.top - bubble.height - margin : anchor.bottom + margin;
    rawLeft = anchor.left + anchor.width / 2 - bubble.width / 2;
  }

  const top = Math.min(Math.max(rawTop, margin), Math.max(margin, vh - bubble.height - margin));
  const left = Math.min(Math.max(rawLeft, margin), Math.max(margin, vw - bubble.width - margin));

  // Both axes pinned to the margin = top-left corner. Only accept when the
  // trigger actually lives in that corner; otherwise this is a bad/stale rect
  // that would flash a stray label before a later remeasure.
  const pinnedTopLeft = top <= margin + 0.5 && left <= margin + 0.5;
  if (pinnedTopLeft) {
    const anchorNearCorner =
      anchor.top < margin + Math.max(anchor.height, 24) &&
      anchor.left < margin + Math.max(anchor.width, 24) &&
      anchor.bottom > 0 &&
      anchor.right > 0;
    if (!anchorNearCorner) return null;
  }

  return { top, left };
}

/**
 * Place an interactive hover menu beside the trigger — prefer trailing (`end` /
 * right in LTR) so the panel does not sit in the vertical scan path of a data
 * table. Flips to `start` when there isn't room. Vertical `align: 'start'`
 * (default) keeps the menu top flush with the chip so OPEN/EDIT stays next to
 * the hovered row.
 *
 * Returns null when the anchor/bubble is untrusted or when clamp would pin the
 * panel to the top-left margin while the trigger is elsewhere.
 */
export function clampPortalSideMenuPosition(args: {
  anchor: PortalRect;
  bubble: Pick<DOMRect, 'width' | 'height'>;
  viewport?: PortalViewport;
  placement?: PortalSideMenuPlacement;
  align?: PortalSideMenuAlign;
  margin?: number;
  gap?: number;
}): { top: number; left: number; side: 'end' | 'start' } | null {
  const margin = args.margin ?? PORTAL_TOOLTIP_MARGIN;
  const gap = args.gap ?? PORTAL_SIDE_MENU_GAP;
  const viewport = args.viewport ?? readPortalViewport();
  const placement = args.placement ?? 'auto';
  const align = args.align ?? 'start';
  const { anchor, bubble } = args;

  if (!isTrustedPortalAnchor(anchor, viewport)) return null;
  if (bubble.width < PORTAL_ANCHOR_MIN_PX || bubble.height < PORTAL_ANCHOR_MIN_PX) return null;

  const vw = viewport.width;
  const vh = viewport.height;

  const roomEnd = vw - anchor.right - margin;
  const roomStart = anchor.left - margin;
  let side: 'end' | 'start';
  if (placement === 'end') {
    side = 'end';
  } else if (placement === 'start') {
    side = 'start';
  } else if (roomEnd >= bubble.width) {
    side = 'end';
  } else if (roomStart >= bubble.width) {
    side = 'start';
  } else {
    side = roomEnd >= roomStart ? 'end' : 'start';
  }

  const rawLeft =
    side === 'end' ? anchor.right + gap : anchor.left - bubble.width - gap;
  const left = Math.min(
    Math.max(rawLeft, margin),
    Math.max(margin, vw - bubble.width - margin),
  );

  let rawTop: number;
  if (align === 'center') {
    rawTop = anchor.top + anchor.height / 2 - bubble.height / 2;
  } else if (align === 'end') {
    rawTop = anchor.bottom - bubble.height;
  } else {
    rawTop = anchor.top;
  }
  const top = Math.min(
    Math.max(rawTop, margin),
    Math.max(margin, vh - bubble.height - margin),
  );

  const pinnedTopLeft = top <= margin + 0.5 && left <= margin + 0.5;
  if (pinnedTopLeft) {
    const anchorNearCorner =
      anchor.top < margin + Math.max(anchor.height, 24) &&
      anchor.left < margin + Math.max(anchor.width, 24) &&
      anchor.bottom > 0 &&
      anchor.right > 0;
    if (!anchorNearCorner) return null;
  }

  // Left-edge pin while the trigger is mid-screen = stray flash (oversized
  // bubble). Legitimate near-left chrome still passes.
  const leftPinned = left <= margin + 0.5;
  if (leftPinned) {
    const anchorNearLeft =
      anchor.left < margin + Math.max(anchor.width, 24) && anchor.right > 0;
    if (!anchorNearLeft) return null;
  }

  return { top, left, side };
}
