'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const DEFAULT_WIDTH = 640;
const DEFAULT_MIN_WIDTH = 320;
/** Keep at least this many px of main content visible while dragging. */
const DEFAULT_MAX_WIDTH_PAD = 240;

function readPersistedWidth(key: string | undefined, fallback: number, minWidth: number): number {
  if (!key || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < minWidth) return fallback;
    const cap = Math.max(minWidth, window.innerWidth - DEFAULT_MAX_WIDTH_PAD);
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
  /** Disable drag (fixed width). */
  enabled?: boolean;
  /** Accessible name for the drag handle. Defaults to the document-pane wording
   *  this hook was lifted from; pass one when the pane is not a document. */
  label?: string;
  /** `data-testid` on the handle. Defaults to the document-pane id. */
  testId?: string;
}

interface HorizontalEdgeHandleProps {
  role: 'separator';
  'aria-orientation': 'vertical';
  'aria-label': string;
  'aria-valuenow': number;
  'data-testid': string;
  tabIndex: number;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

/**
 * Pixel-width drag for a right-edge slide-over (left-edge handle).
 * Dragging left grows the panel; dragging right shrinks it.
 * Lifted from ZohoSplitPane — shared SoT for horizontal document panes.
 */
export function useHorizontalEdgeResize({
  storageKey,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidthPad = DEFAULT_MAX_WIDTH_PAD,
  enabled = true,
  label = 'Resize document panel',
  testId = 'document-slide-over-resize',
}: UseHorizontalEdgeResizeOptions = {}) {
  const [width, setWidthState] = useState(() =>
    readPersistedWidth(storageKey, defaultWidth, minWidth),
  );
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(width);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (!storageKey) return;
    setWidthState(readPersistedWidth(storageKey, defaultWidth, minWidth));
  }, [storageKey, defaultWidth, minWidth]);

  const clamp = useCallback(
    (next: number) => {
      if (typeof window === 'undefined') {
        return Math.max(minWidth, next);
      }
      const cap = Math.max(minWidth, window.innerWidth - maxWidthPad);
      return Math.max(minWidth, Math.min(cap, next));
    },
    [minWidth, maxWidthPad],
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
      // Dragging left (negative deltaX from start) grows a right-anchored pane.
      const next = dragRef.current.startWidth - (ev.clientX - dragRef.current.startX);
      setWidth(next);
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

  const edgeHandleProps: HorizontalEdgeHandleProps = {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': label,
    'aria-valuenow': Math.round(width),
    'data-testid': testId,
    tabIndex: enabled ? 0 : -1,
    onPointerDown,
  };

  return { width, setWidth, isDragging, edgeHandleProps };
}
