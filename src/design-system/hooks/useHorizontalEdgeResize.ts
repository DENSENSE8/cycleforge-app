'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const DEFAULT_WIDTH = 640;
const DEFAULT_MIN_WIDTH = 320;
/** Keep at least this many px of main content visible while dragging. */
const DEFAULT_MAX_WIDTH_PAD = 240;
/** Arrow-key resize step — one keypress, one deliberate nudge. */
const KEYBOARD_STEP_PX = 16;
/** Shift+Arrow step — a keyboard-only user reaching the far end of the
 *  range one `KEYBOARD_STEP_PX` at a time would need dozens of presses. */
const KEYBOARD_STEP_LARGE_PX = 80;

/**
 * Which edge of the panel owns the drag handle.
 *
 * - `leading` — left-edge handle on a **right-anchored** pane (document /
 *   detail stack). Dragging left grows; dragging right shrinks.
 * - `trailing` — right-edge handle on a **left-anchored** pane (context
 *   panel / receiving rail). Dragging right grows; dragging left shrinks.
 */
export type HorizontalEdge = 'leading' | 'trailing';

/** Pure drag math — exported so unit tests cover both edges without mounting. */
export function widthFromEdgeDrag(
  startWidth: number,
  startX: number,
  clientX: number,
  edge: HorizontalEdge,
): number {
  const delta = clientX - startX;
  return edge === 'trailing' ? startWidth + delta : startWidth - delta;
}

/** Viewport pad + optional absolute px cap — shared by hydrate + drag clamp. */
export function edgeResizeWidthCap(
  minWidth: number,
  maxWidthPad: number,
  maxWidth: number | undefined,
  viewportWidth: number | undefined,
): number {
  const viewportCap =
    viewportWidth == null
      ? maxWidth ?? Number.POSITIVE_INFINITY
      : Math.max(minWidth, viewportWidth - maxWidthPad);
  if (maxWidth == null) return viewportCap;
  return Math.max(minWidth, Math.min(maxWidth, viewportCap));
}

/**
 * Release-time decision for opt-in drag-past-min collapse.
 * Compares the **raw** (unclamped) drag width to {@link collapseBelowPx}.
 * Live layout still floors at `minWidth` during the drag.
 */
export function shouldCollapseFromEdgeDrag(
  rawWidth: number,
  collapseBelowPx: number | undefined,
): boolean {
  if (collapseBelowPx == null || !Number.isFinite(collapseBelowPx)) return false;
  if (!Number.isFinite(rawWidth)) return false;
  return rawWidth < collapseBelowPx;
}

/** Default past-min slack when {@link UseHorizontalEdgeResizeOptions.onCollapseBeyondMin} is set. */
export const EDGE_RESIZE_COLLAPSE_SLACK_PX = 48;

/**
 * Which collapse threshold the drag is currently LEANING against — the pane is
 * pinned at a bound (its live width clamped) and the operator is pushing past it
 * in the slack window, one shove from a collapse. Feeds the splitter's
 * "arm-to-close" highlight (VS Code / Figma snap-zone grammar) so a collapse is
 * never a surprise: the seam of the thing about to close lights before it fires.
 *
 * - `'overshoot'` — dragging past the MAX cap (pane pinned at cap, `raw > clamped`)
 *   but not yet past {@link UseHorizontalEdgeResizeOptions.overshootBeyondPx}
 *   (which closes the FAR rail — the station cascade's Stage 3).
 * - `'collapse'` — dragging past the MIN floor (pane pinned at min, `raw < clamped`)
 *   but not yet past {@link UseHorizontalEdgeResizeOptions.collapseBelowPx}
 *   (which parks THIS pane — drag-past-min self-collapse).
 * - `'none'` — resizing normally, or a bound with no collapse wired to arm.
 */
type EdgeDragArm = 'none' | 'collapse' | 'overshoot';

/**
 * Pure. `clampedWidth` is the live layout width AFTER `[minWidth, cap]` clamping,
 * so `raw` diverging from it is exactly "the operator is leaning against a bound".
 * A threshold is only armable when its collapse is wired (its `*Px` arg is set);
 * a bare bound with nothing to collapse arms nothing.
 */
export function edgeDragArmState(args: {
  rawWidth: number;
  clampedWidth: number;
  collapseBelowPx?: number;
  overshootBeyondPx?: number;
}): EdgeDragArm {
  const { rawWidth, clampedWidth, collapseBelowPx, overshootBeyondPx } = args;
  if (!Number.isFinite(rawWidth) || !Number.isFinite(clampedWidth)) return 'none';
  if (
    overshootBeyondPx != null &&
    Number.isFinite(overshootBeyondPx) &&
    rawWidth > clampedWidth &&
    rawWidth <= overshootBeyondPx
  ) {
    return 'overshoot';
  }
  if (
    collapseBelowPx != null &&
    Number.isFinite(collapseBelowPx) &&
    rawWidth < clampedWidth &&
    rawWidth >= collapseBelowPx
  ) {
    return 'collapse';
  }
  return 'none';
}

function readPersistedWidth(
  key: string | undefined,
  fallback: number,
  minWidth: number,
  maxWidthPad: number,
  maxWidth?: number,
): number {
  if (!key || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < minWidth) return fallback;
    const cap = edgeResizeWidthCap(minWidth, maxWidthPad, maxWidth, window.innerWidth);
    return Math.min(parsed, cap);
  } catch {
    return fallback;
  }
}

interface UseHorizontalEdgeResizeOptions {
  /** When set, width persists under this localStorage key. */
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  /** Leave at least this many px of viewport for the main surface. */
  maxWidthPad?: number;
  /**
   * Absolute px ceiling (e.g. Ticket push chat column). Combined with
   * {@link maxWidthPad} — the tighter of the two wins.
   */
  maxWidth?: number;
  /** Disable drag (fixed width). */
  enabled?: boolean;
  /**
   * Which edge of the panel owns the handle. Defaults to `leading` (the
   * right-anchored document/detail panes this hook was lifted from).
   */
  edge?: HorizontalEdge;
  /** Accessible name for the drag handle. Defaults to the document-pane wording
   *  this hook was lifted from; pass one when the pane is not a document. */
  label?: string;
  /** `data-testid` on the handle. Defaults to the document-pane id. */
  testId?: string;
  /**
   * Opt-in: on pointerup, if the raw (unclamped) drag width is below
   * {@link collapseBelowPx}, call this instead of flooring at minWidth.
   * Live layout still clamps to minWidth during the drag; a collapse release
   * restores the pre-drag width so a collapse gesture never persists the floor.
   */
  onCollapseBeyondMin?: () => void;
  /**
   * Raw-width threshold for {@link onCollapseBeyondMin}. Defaults to
   * `minWidth - {@link EDGE_RESIZE_COLLAPSE_SLACK_PX}` when the callback is set.
   */
  collapseBelowPx?: number;
  /**
   * Opt-in mirror of {@link onCollapseBeyondMin} for the GROW end: fired once
   * (edge-triggered) mid-drag when the raw (unclamped) drag width pushes past
   * {@link overshootBeyondPx}. Used by the station cascade's Stage 3 — dragging a
   * sash past the point the far rail is squeezed to its min closes that far rail
   * (freeing its width for this pane). Fires again only after the raw width drops
   * back below the threshold and re-crosses it, so it never spams.
   */
  onOvershootMax?: () => void;
  /** Raw-width threshold for {@link onOvershootMax} (typically `maxWidth + slack`). */
  overshootBeyondPx?: number;
}

/** Props spread onto {@link HorizontalEdgeResizeHandle} (or a raw hit target). */
export interface HorizontalEdgeHandleProps {
  role: 'separator';
  'aria-orientation': 'vertical';
  'aria-label': string;
  'aria-valuenow': number;
  'data-testid': string;
  tabIndex: number;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Double-click snaps back to `defaultWidth` (and persists). */
  onDoubleClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  /**
   * Arrow keys nudge the width (Shift+Arrow for a larger step); Home/End jump
   * to the floor/ceiling. The WAI-ARIA "window splitter" pattern for a
   * focusable `role="separator"` — without this the handle was reachable by
   * Tab (`tabIndex={0}`, `aria-valuenow`) but inert on every key press.
   */
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Pixel-width drag for a horizontally resizable pane.
 *
 * Default (`edge: 'leading'`): right-edge slide-over with a left-edge handle —
 * dragging left grows the panel. Pass `edge: 'trailing'` for a left-anchored
 * column with a right-edge handle (dragging right grows).
 *
 * Lifted from ZohoSplitPane — shared SoT for horizontal document panes and
 * the receiving context-panel rail.
 */
export function useHorizontalEdgeResize({
  storageKey,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidthPad = DEFAULT_MAX_WIDTH_PAD,
  maxWidth,
  enabled = true,
  edge = 'leading',
  label = 'Resize document panel',
  testId = 'document-slide-over-resize',
  onCollapseBeyondMin,
  collapseBelowPx,
  onOvershootMax,
  overshootBeyondPx,
}: UseHorizontalEdgeResizeOptions = {}) {
  // Start at the design default so SSR HTML and the first client paint agree;
  // localStorage hydrates in the effect below (avoids a width mismatch).
  const [width, setWidthState] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  // Which collapse threshold the live drag is leaning against — drives the
  // "arm-to-close" seam highlight. `'none'` at rest / while resizing normally.
  // React bails on an unchanged value, so setting it every pointermove is
  // effectively edge-triggered (no re-render unless the zone changed).
  const [armState, setArmState] = useState<EdgeDragArm>('none');
  const widthRef = useRef(width);
  const edgeRef = useRef(edge);
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
    rawWidth: number;
  } | null>(null);
  const onCollapseBeyondMinRef = useRef(onCollapseBeyondMin);
  const collapseBelowPxRef = useRef(
    collapseBelowPx ??
      (onCollapseBeyondMin ? minWidth - EDGE_RESIZE_COLLAPSE_SLACK_PX : undefined),
  );
  const onOvershootMaxRef = useRef(onOvershootMax);
  const overshootBeyondPxRef = useRef(overshootBeyondPx);
  // Edge-trigger latch — fire the overshoot once per upward crossing.
  const overshootFiredRef = useRef(false);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    edgeRef.current = edge;
  }, [edge]);

  useEffect(() => {
    onCollapseBeyondMinRef.current = onCollapseBeyondMin;
  }, [onCollapseBeyondMin]);

  useEffect(() => {
    collapseBelowPxRef.current =
      collapseBelowPx ??
      (onCollapseBeyondMin ? minWidth - EDGE_RESIZE_COLLAPSE_SLACK_PX : undefined);
  }, [collapseBelowPx, onCollapseBeyondMin, minWidth]);

  useEffect(() => {
    onOvershootMaxRef.current = onOvershootMax;
  }, [onOvershootMax]);

  useEffect(() => {
    overshootBeyondPxRef.current = overshootBeyondPx;
  }, [overshootBeyondPx]);

  useEffect(() => {
    if (!storageKey) return;
    setWidthState(
      readPersistedWidth(storageKey, defaultWidth, minWidth, maxWidthPad, maxWidth),
    );
    // Hydrate from storage when the preference key / defaults change — not on
    // every `maxWidth` tick. Cap changes clamp the live width below so a
    // mid-drag frame-cap bump (station dual-rail coupling) cannot re-read an
    // stale localStorage value and stomp the sash.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- maxWidth via clamp effect
  }, [storageKey, defaultWidth, minWidth, maxWidthPad]);

  useEffect(() => {
    setWidthState((current) => {
      const viewportWidth = typeof window === 'undefined' ? undefined : window.innerWidth;
      const cap = edgeResizeWidthCap(minWidth, maxWidthPad, maxWidth, viewportWidth);
      if (!Number.isFinite(cap)) return Math.max(minWidth, current);
      const next = Math.max(minWidth, Math.min(cap, current));
      if (next === current) return current;
      widthRef.current = next;
      return next;
    });
  }, [minWidth, maxWidthPad, maxWidth]);

  const clamp = useCallback(
    (next: number) => {
      const viewportWidth = typeof window === 'undefined' ? undefined : window.innerWidth;
      const cap = edgeResizeWidthCap(minWidth, maxWidthPad, maxWidth, viewportWidth);
      if (!Number.isFinite(cap)) return Math.max(minWidth, next);
      return Math.max(minWidth, Math.min(cap, next));
    },
    [minWidth, maxWidthPad, maxWidth],
  );

  const persistWidth = useCallback(
    (value: number) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, String(value));
      } catch {
        /* private mode / quota */
      }
    },
    [storageKey],
  );

  const setWidth = useCallback(
    (next: number) => {
      const clamped = clamp(next);
      widthRef.current = clamped;
      setWidthState(clamped);
      persistWidth(clamped);
    },
    [clamp, persistWidth],
  );

  /** Live drag width — clamps for layout, does not persist until pointerup. */
  const applyLiveWidth = useCallback(
    (next: number) => {
      const clamped = clamp(next);
      widthRef.current = clamped;
      setWidthState(clamped);
    },
    [clamp],
  );

  const stopDrag = useCallback(() => {
    if (!dragRef.current) return;
    const { startWidth, rawWidth } = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    setArmState('none');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (
      onCollapseBeyondMinRef.current &&
      shouldCollapseFromEdgeDrag(rawWidth, collapseBelowPxRef.current)
    ) {
      // Restore pre-drag preference — a collapse gesture must not bake the
      // min floor into storage.
      widthRef.current = startWidth;
      setWidthState(startWidth);
      persistWidth(startWidth);
      onCollapseBeyondMinRef.current();
      return;
    }

    persistWidth(widthRef.current);
  }, [persistWidth]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const raw = widthFromEdgeDrag(
        dragRef.current.startWidth,
        dragRef.current.startX,
        ev.clientX,
        edgeRef.current,
      );
      dragRef.current.rawWidth = raw;
      applyLiveWidth(raw);
      const beyond = overshootBeyondPxRef.current;
      const onOvershoot = onOvershootMaxRef.current;
      const onCollapse = onCollapseBeyondMinRef.current;
      // Arm-to-close highlight: `widthRef.current` is the just-clamped live width,
      // so `raw` diverging from it means the pane is pinned at a bound and the
      // operator is pushing into the slack window — one shove from a collapse.
      // Only a threshold with a wired collapse arms (a bare bound highlights
      // nothing).
      setArmState(
        edgeDragArmState({
          rawWidth: raw,
          clampedWidth: widthRef.current,
          overshootBeyondPx: onOvershoot ? beyond : undefined,
          collapseBelowPx: onCollapse ? collapseBelowPxRef.current : undefined,
        }),
      );
      // Stage-3 overshoot: edge-triggered when the raw drag pushes past the cap
      // (the far rail is at its min and the operator keeps pulling) → close the
      // far rail for more room. Re-arms once raw drops back below the threshold.
      if (beyond != null && Number.isFinite(beyond) && onOvershoot) {
        if (raw > beyond) {
          if (!overshootFiredRef.current) {
            overshootFiredRef.current = true;
            onOvershoot();
          }
        } else {
          overshootFiredRef.current = false;
        }
      }
    };
    const onUp = () => stopDrag();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDragging, applyLiveWidth, stopDrag]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const startWidth = widthRef.current;
      dragRef.current = { startX: e.clientX, startWidth, rawWidth: startWidth };
      overshootFiredRef.current = false;
      setArmState('none');
      setIsDragging(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [enabled],
  );

  const onDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      // Cancel any drag the first click of the double-click started.
      if (dragRef.current) stopDrag();
      setWidth(defaultWidth);
    },
    [enabled, defaultWidth, setWidth, stopDrag],
  );

  /**
   * Arrow-key resize — see {@link HorizontalEdgeHandleProps.onKeyDown}.
   * Direction mirrors {@link widthFromEdgeDrag}: on a `trailing` edge, moving
   * the handle right (ArrowRight) grows the pane, same as dragging right;
   * on `leading`, right shrinks it (dragging right shrinks a leading-edge
   * handle too — see the `HorizontalEdge` doc above `widthFromEdgeDrag`).
   * `setWidth` (not `applyLiveWidth`) — a keypress is a discrete commit, not
   * a live drag frame, so it persists immediately like a click would.
   */
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (e.key === 'Home') {
        e.preventDefault();
        setWidth(minWidth);
        return;
      }
      if (e.key === 'End') {
        // Infinity always lands exactly on the live cap — `setWidth`'s own
        // `clamp()` computes it fresh, so this never duplicates
        // `edgeResizeWidthCap`'s viewport/maxWidth math.
        e.preventDefault();
        setWidth(Number.POSITIVE_INFINITY);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const step = e.shiftKey ? KEYBOARD_STEP_LARGE_PX : KEYBOARD_STEP_PX;
      const sign = e.key === 'ArrowRight' ? 1 : -1;
      const dir = edgeRef.current === 'trailing' ? 1 : -1;
      setWidth(widthRef.current + sign * dir * step);
    },
    [enabled, minWidth, setWidth],
  );

  const edgeHandleProps: HorizontalEdgeHandleProps = {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': label,
    'aria-valuenow': Math.round(width),
    'data-testid': testId,
    tabIndex: enabled ? 0 : -1,
    onPointerDown,
    onDoubleClick,
    onKeyDown,
  };

  return {
    width,
    setWidth,
    isDragging,
    edgeHandleProps,
    /**
     * True while a drag is leaning past the MIN floor into the
     * {@link onCollapseBeyondMin} slack — this pane is one shove from parking
     * itself. Feeds the sash's arm-to-close highlight.
     */
    collapseArmed: armState === 'collapse',
    /**
     * True while a drag is leaning past the MAX cap into the
     * {@link onOvershootMax} slack — the FAR rail is pinned at its min and one
     * shove from closing (the station cascade's Stage 3). Feeds the sash's
     * arm-to-close highlight and the cross-rail relay.
     */
    overshootArmed: armState === 'overshoot',
  };
}
