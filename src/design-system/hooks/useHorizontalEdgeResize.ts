'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const DEFAULT_WIDTH = 640;
const DEFAULT_MIN_WIDTH = 320;
/** Keep at least this many px of main content visible while dragging. */
const DEFAULT_MAX_WIDTH_PAD = 240;

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
}: UseHorizontalEdgeResizeOptions = {}) {
  // Start at the design default so SSR HTML and the first client paint agree;
  // localStorage hydrates in the effect below (avoids a width mismatch).
  const [width, setWidthState] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(width);
  const edgeRef = useRef(edge);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    edgeRef.current = edge;
  }, [edge]);

  useEffect(() => {
    if (!storageKey) return;
    setWidthState(
      readPersistedWidth(storageKey, defaultWidth, minWidth, maxWidthPad, maxWidth),
    );
  }, [storageKey, defaultWidth, minWidth, maxWidthPad, maxWidth]);

  const clamp = useCallback(
    (next: number) => {
      const viewportWidth = typeof window === 'undefined' ? undefined : window.innerWidth;
      const cap = edgeResizeWidthCap(minWidth, maxWidthPad, maxWidth, viewportWidth);
      if (!Number.isFinite(cap)) return Math.max(minWidth, next);
      return Math.max(minWidth, Math.min(cap, next));
    },
    [minWidth, maxWidthPad, maxWidth],
  );

  const setWidth = useCallback(
    (next: number) => {
      const clamped = clamp(next);
      widthRef.current = clamped;
      setWidthState(clamped);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, String(clamped));
        } catch {
          /* private mode / quota */
        }
      }
    },
    [clamp, storageKey],
  );

  const stopDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, String(widthRef.current));
      } catch {
        /* noop */
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      setWidth(
        widthFromEdgeDrag(
          dragRef.current.startWidth,
          dragRef.current.startX,
          ev.clientX,
          edgeRef.current,
        ),
      );
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
  }, [isDragging, setWidth, stopDrag]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startWidth: widthRef.current };
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

  const edgeHandleProps: HorizontalEdgeHandleProps = {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': label,
    'aria-valuenow': Math.round(width),
    'data-testid': testId,
    tabIndex: enabled ? 0 : -1,
    onPointerDown,
    onDoubleClick,
  };

  return { width, setWidth, isDragging, edgeHandleProps };
}
