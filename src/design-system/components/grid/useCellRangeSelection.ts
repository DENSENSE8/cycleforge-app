'use client';

/**
 * Google-Sheets cell RANGE selection for a grid (owner 2026-10-04: "click and
 * hold and drag for exact cells"). One delegated pointer handler on the grid
 * host — no per-cell listeners, so thousands of virtualized rows stay smooth.
 *
 * A cell is any element with `data-col="<column key>"` inside a row with
 * `data-range-row="<visible row index>"`. Mouse down on a cell and drag:
 * the rectangle anchor → hovered cell is selected, auto-scrolling when the
 * pointer passes the scroller's edge (both axes; frozen columns and
 * virtualized rows included — the hovered cell is re-read every frame).
 * Release copies the range (`onCommit`). A press that does not move is a
 * plain click (`onCell`, the host's single-cell copy); Shift+press extends
 * from the anchor. The host's keys extend (`extend`), copy (`range`) and
 * clear (`clear`). While dragging the grid takes `user-select: none`.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export interface CellPoint {
  row: number;
  col: number;
}

/** A normalized rectangle (inclusive) plus where it started. */
export interface CellRange {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  anchor: CellPoint;
}

/** Pixels the pointer travels before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;
/** Within this many pixels of the scroller's edge, a drag scrolls. */
const EDGE_PX = 36;
/** Scroll speed at the edge line, px per ms (deeper past the edge, up to twice that). Time-based, so a slow frame never slows the scroll. */
const EDGE_SPEED_PX_PER_MS = 1.2;
/** A stalled frame scrolls at most this much time's worth. */
const MAX_FRAME_MS = 64;

export function normalizeRange(anchor: CellPoint, focus: CellPoint): CellRange {
  return {
    r0: Math.min(anchor.row, focus.row),
    r1: Math.max(anchor.row, focus.row),
    c0: Math.min(anchor.col, focus.col),
    c1: Math.max(anchor.col, focus.col),
    anchor,
  };
}

function cellAt(target: Element | null, colIndex: ReadonlyMap<string, number>): CellPoint | null {
  const cell = target?.closest<HTMLElement>('[data-col]');
  const row = cell?.closest<HTMLElement>('[data-range-row]');
  if (!cell || !row) return null;
  const col = colIndex.get(cell.dataset.col ?? '');
  const index = Number(row.dataset.rangeRow);
  return col == null || !Number.isFinite(index) ? null : { row: index, col };
}

function scrollParent(from: HTMLElement | null, axis: 'x' | 'y'): HTMLElement | null {
  let el = from;
  while (el) {
    const style = getComputedStyle(el);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    const room = axis === 'x' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
    if (room && (overflow === 'auto' || overflow === 'scroll')) return el;
    el = el.parentElement;
  }
  return null;
}

/** Edge pressure for a pointer `at` against the band [lo, hi]: −2..0 near lo, 0..2 near hi (1 = on the edge line). */
function edgePressure(at: number, lo: number, hi: number): number {
  if (at < lo + EDGE_PX) return -Math.min(2, (lo + EDGE_PX - at) / EDGE_PX);
  if (at > hi - EDGE_PX) return Math.min(2, (at - (hi - EDGE_PX)) / EDGE_PX);
  return 0;
}

export interface CellRangeSelection {
  range: CellRange | null;
  /** Dragging now — the host paints `user-select: none`. */
  dragging: boolean;
  /** Delegate on the grid host. */
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Shift+arrows: move the focus corner, keeping the anchor; with no range, starts at `fallback`. */
  extend: (dRow: number, dCol: number, fallback: CellPoint | null) => void;
  clear: () => void;
}

export function useCellRangeSelection({
  hostRef,
  colKeys,
  rowCount,
  onCommit,
  onCell,
}: {
  hostRef: RefObject<HTMLElement | null>;
  /** The visible columns, in screen order. */
  colKeys: readonly string[];
  rowCount: number;
  /** A drag or Shift+press ended on this range — copy it. */
  onCommit: (range: CellRange) => void;
  /** A plain press (no drag, no Shift) on one cell. */
  onCell: (cell: CellPoint) => void;
}): CellRangeSelection {
  const [anchor, setAnchor] = useState<CellPoint | null>(null);
  const [focus, setFocus] = useState<CellPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const live = useRef({ anchor, focus, colKeys, rowCount, onCommit, onCell });
  live.current = { anchor, focus, colKeys, rowCount, onCommit, onCell };
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const clamp = useCallback((point: CellPoint): CellPoint => {
    const { rowCount: rows, colKeys: cols } = live.current;
    return { row: Math.max(0, Math.min(rows - 1, point.row)), col: Math.max(0, Math.min(cols.length - 1, point.col)) };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      // A control inside a cell (the open-record icon) keeps its own press; the header never selects.
      if (target.closest('button, a, input, textarea, select, [role=columnheader], [data-resize-grip]')) return;
      const colIndex = new Map(live.current.colKeys.map((key, index) => [key, index]));
      const start = cellAt(target, colIndex);
      if (!start) return;
      event.preventDefault();
      const extending = event.shiftKey && live.current.anchor != null;
      const from = extending ? live.current.anchor! : start;
      if (extending) {
        setFocus(start);
        live.current.onCommit(normalizeRange(from, start));
        return;
      }
      const origin = { x: event.clientX, y: event.clientY };
      let point = { x: event.clientX, y: event.clientY };
      let moved = false;
      let frame = 0;
      let current = start;
      const host = hostRef.current;
      const scrollerY = scrollParent(target, 'y');
      const scrollerX = scrollParent(target, 'x');

      const readCell = () => {
        // Clamp the probe inside the scroller so a pointer past the edge still names the edge cell.
        const box = (scrollerY ?? host)?.getBoundingClientRect();
        const boxX = (scrollerX ?? host)?.getBoundingClientRect();
        const x = boxX ? Math.max(boxX.left + 1, Math.min(boxX.right - 2, point.x)) : point.x;
        const y = box ? Math.max(box.top + 1, Math.min(box.bottom - 2, point.y)) : point.y;
        const hit = cellAt(document.elementFromPoint(x, y), colIndex);
        if (hit && (hit.row !== current.row || hit.col !== current.col)) {
          current = hit;
          setFocus(hit);
        }
      };
      let last = 0;
      const tick = (now: number) => {
        frame = 0;
        if (!moved) return;
        const ms = Math.min(MAX_FRAME_MS, last ? now - last : 16);
        last = now;
        let scrolled = false;
        if (scrollerY) {
          const r = scrollerY.getBoundingClientRect();
          const dy = Math.round(edgePressure(point.y, r.top, r.bottom) * EDGE_SPEED_PX_PER_MS * ms);
          if (dy !== 0) {
            const before = scrollerY.scrollTop;
            scrollerY.scrollTop += dy;
            scrolled ||= scrollerY.scrollTop !== before;
          }
        }
        if (scrollerX) {
          const r = scrollerX.getBoundingClientRect();
          const dx = Math.round(edgePressure(point.x, r.left, r.right) * EDGE_SPEED_PX_PER_MS * ms);
          if (dx !== 0) {
            const before = scrollerX.scrollLeft;
            scrollerX.scrollLeft += dx;
            scrolled ||= scrollerX.scrollLeft !== before;
          }
        }
        readCell();
        if (scrolled) frame = requestAnimationFrame(tick);
        else last = 0;
      };
      const move = (e: PointerEvent) => {
        point = { x: e.clientX, y: e.clientY };
        if (!moved) {
          if (Math.hypot(point.x - origin.x, point.y - origin.y) < DRAG_THRESHOLD_PX) return;
          moved = true;
          setAnchor(start);
          setFocus(start);
          setDragging(true);
        }
        if (!frame) frame = requestAnimationFrame(tick);
      };
      const up = () => {
        stop();
        if (moved) {
          setDragging(false);
          live.current.onCommit(normalizeRange(start, current));
        } else {
          setAnchor(start);
          setFocus(start);
          live.current.onCell(start);
        }
      };
      const stop = () => {
        if (frame) cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        stopDrag.current = null;
      };
      const cancel = () => {
        stop();
        setDragging(false);
      };
      stopDrag.current = cancel;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [hostRef],
  );

  const extend = useCallback(
    (dRow: number, dCol: number, fallback: CellPoint | null) => {
      const { anchor: a, focus: f } = live.current;
      const start = a ?? fallback;
      if (!start) return;
      const next = clamp({ row: (f ?? start).row + dRow, col: (f ?? start).col + dCol });
      if (!a) setAnchor(start);
      setFocus(next);
    },
    [clamp],
  );

  const clear = useCallback(() => {
    setAnchor(null);
    setFocus(null);
  }, []);

  // A list that shrinks under the range (a filter) drops it rather than pointing past the end.
  useEffect(() => {
    if (anchor && (anchor.row >= rowCount || anchor.col >= colKeys.length)) clear();
  }, [anchor, rowCount, colKeys.length, clear]);

  return {
    range: anchor && focus ? normalizeRange(anchor, focus) : null,
    dragging,
    onPointerDown,
    extend,
    clear,
  };
}
