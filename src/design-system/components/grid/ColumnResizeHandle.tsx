'use client';

import { useCallback, useRef } from 'react';
import { clampColumnWidth } from '@/components/ui/table-column-config/useColumnWidths';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { gridColVar } from './grid-column-geometry';
import type { GridColumnResizeEdge } from './grid-column-resize-edges';
import { cn } from '@/utils/_cn';

/** Keyboard nudge per arrow press. */
const NUDGE_PX = 12;

const surfaceOf = (el: HTMLElement | null) => (el?.closest('[data-cf-grid]') as HTMLElement | null) ?? null;
const cellOf = (el: HTMLElement | null) => (el?.closest('[data-col]') as HTMLElement | null) ?? null;

/**
 * Drag handle on a resizable column header edge — the Airtable / Sheets
 * affordance, and the ONE implementation for every LedgerGrid family.
 *
 * **Hit vs paint:** the button is a **16px** (`w-4`) grab zone so operators can
 * click-and-hold the seam without missing into the sort header; the painted
 * rule stays a **1px** hairline (`w-px` child). Do not tidy the hit back to
 * `w-2` — that 8px target is why resize felt impossible next to click-to-sort.
 *
 * **Default (`edge="end"`):** mounts on the cell's right edge and mutates this
 * column — left-of-divider owns the seam.
 *
 * **Frozen-edge exception (`edge="start"`):** when the frozen edge column itself
 * is resizable, the first resizable column after the sticky identity pane also
 * mounts a leading grip so operators grabbing the scrollable side of the frozen
 * seam (Incoming By, Orders Ship by) resize that column, not Product. A locked
 * frozen edge (Receiving `order`) skips this — Product keeps a right grip only.
 * Drag/keyboard deltas invert on `start`: drag left grows. See
 * {@link resolveColumnResizeEdges}.
 *
 * `flush` drops the `-right-1` overhang on a trailing frozen-edge grip so it
 * cannot steal hit-testing into the scrollable pane.
 *
 * During a drag it mutates ONLY the grid surface's `--cf-col-<key>` CSS var (via
 * the nearest `[data-cf-grid]` ancestor), so header, rows and group summaries
 * reflow together through CSS with zero React re-render — and the frozen pane's
 * sticky-left offsets follow, because `gridFrozenLeft`-style math is itself a
 * `calc()` over those same vars. The final width is COMMITTED once on drop via
 * `onCommit` (→ persisted per staff in `staff_preferences.tableColumns[t].widths`).
 *
 * **Double-click / Enter = reset to default** (clear the persisted override),
 * matching panel edge handles and the column menu's "Reset width". Content
 * autofit lives on the context menu — never on this grip (autofit was why
 * double-click used to grow the column to the right).
 *
 * Not animated: it tracks the pointer, and a transition on a drag reads as lag.
 * Keyboard-accessible (←/→ nudge · Enter = reset to default).
 *
 * It lives in the DS grid module rather than beside the Orders queue that first
 * grew it: it was written generic (it already keyed off `[data-cf-grid]` and a
 * per-key CSS var) and only its import path was parochial.
 */
export function ColumnResizeHandle({
  colKey,
  label,
  onCommit,
  onReset,
  edge = 'end',
  flush = false,
  minWidthPx,
  maxWidthPx,
}: {
  colKey: string;
  label: string;
  onCommit: (px: number) => void;
  /** Drop the persisted width override — SoT track returns. */
  onReset: () => void;
  edge?: GridColumnResizeEdge;
  /** Trailing grip on the frozen-edge column — no overhang into the next track. */
  flush?: boolean;
  /**
   * Resolved floor (px) — typed track + staff min. Defaults to the house 64px
   * clamp. Stamp-face dates pass `gridTrackRemToPx(resolveGridColumnMinTrackRem(col))`.
   */
  minWidthPx?: number;
  /**
   * Resolved ceiling (px) — staff max, else house 720. Absolute rail is 2000.
   */
  maxWidthPx?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // After double-click reset, the trailing pointerup must not re-commit a width.
  const skipCommitRef = useRef(false);
  // Leading edge: drag left grows (inverted). Trailing: drag right grows.
  const sign = edge === 'start' ? -1 : 1;
  const clamp = useCallback(
    (px: number) => clampColumnWidth(px, minWidthPx, maxWidthPx),
    [minWidthPx, maxWidthPx],
  );

  const resetToDefault = useCallback(() => {
    const surface = surfaceOf(ref.current);
    // Clear the live override immediately; prefs catch up via onReset.
    surface?.style.removeProperty(gridColVar(colKey));
    skipCommitRef.current = true;
    onReset();
  }, [colKey, onReset]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const cell = cellOf(ref.current);
      const surface = surfaceOf(ref.current);
      if (!cell || !surface) return;
      skipCommitRef.current = false;
      const startX = e.clientX;
      const startW = cell.getBoundingClientRect().width;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      // Hold the pointer on the grip so a few px of drift does not drop the drag
      // back onto the sort header mid-gesture.
      e.currentTarget.setPointerCapture(e.pointerId);

      // Local closures capture the live `onCommit` + start metrics, so the same
      // function refs add/remove cleanly (no stale-listener leak).
      const move = (ev: PointerEvent) => {
        surface.style.setProperty(
          gridColVar(colKey),
          `${clamp(startW + sign * (ev.clientX - startX))}px`,
        );
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        if (skipCommitRef.current) {
          skipCommitRef.current = false;
          return;
        }
        onCommit(clamp(startW + sign * (ev.clientX - startX)));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [clamp, colKey, onCommit, sign],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const cell = cellOf(ref.current);
      if (!cell) return;
      const w = cell.getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onCommit(clamp(w + sign * -NUDGE_PX));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onCommit(clamp(w + sign * NUDGE_PX));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resetToDefault();
      }
    },
    [clamp, onCommit, resetToDefault, sign],
  );

  const positionClass =
    edge === 'start'
      ? 'left-0' // flush — never steal into the frozen pane
      : flush
        ? 'right-0'
        : '-right-1';

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`Resize ${label} column · double-click for default`}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        resetToDefault();
      }}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        // 16px hit / 1px paint — see file docblock. Never shrink to w-2.
        'ds-raw-button absolute top-0 z-raised flex h-full w-4 cursor-col-resize touch-none items-stretch justify-center',
        positionClass,
        'opacity-0 transition-opacity duration-100 group-hover/hcell:opacity-100 focus-visible:opacity-100',
        focusRing('control', 'accent'),
      )}
    >
      <span className="my-1 w-px rounded bg-border-strong" aria-hidden />
    </button>
  );
}
