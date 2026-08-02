'use client';

import { useCallback, useRef } from 'react';
import {
  COLUMN_WIDTH_MIN,
  clampColumnWidth,
} from '@/components/ui/table-column-config/useColumnWidths';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { gridColVar } from './grid-column-geometry';
import { cn } from '@/utils/_cn';

/** Keyboard nudge per arrow press. */
const NUDGE_PX = 12;
/** Slack added around measured content on resize-to-fit. */
const FIT_SLACK_PX = 20;

const surfaceOf = (el: HTMLElement | null) => (el?.closest('[data-cf-grid]') as HTMLElement | null) ?? null;
const cellOf = (el: HTMLElement | null) => (el?.closest('[data-col]') as HTMLElement | null) ?? null;

/**
 * Drag handle on a resizable column header's right edge — the Airtable / Sheets
 * affordance, and the ONE implementation for every LedgerGrid family.
 *
 * During a drag it mutates ONLY the grid surface's `--cf-col-<key>` CSS var (via
 * the nearest `[data-cf-grid]` ancestor), so header, rows and group summaries
 * reflow together through CSS with zero React re-render — and the frozen pane's
 * sticky-left offsets follow, because `gridFrozenLeft`-style math is itself a
 * `calc()` over those same vars. The final width is COMMITTED once on drop via
 * `onCommit` (→ persisted per staff in `staff_preferences.tableColumns[t].widths`).
 *
 * Not animated: it tracks the pointer, and a transition on a drag reads as lag.
 * Keyboard-accessible (←/→ nudge · Enter = resize-to-fit); double-click =
 * resize-to-fit.
 *
 * It lives in the DS grid module rather than beside the Orders queue that first
 * grew it: it was written generic (it already keyed off `[data-cf-grid]` and a
 * per-key CSS var) and only its import path was parochial.
 */
export function ColumnResizeHandle({
  colKey,
  label,
  onCommit,
}: {
  colKey: string;
  label: string;
  onCommit: (px: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const resizeToFit = useCallback(() => {
    const surface = surfaceOf(ref.current);
    if (!surface) return;
    let max = COLUMN_WIDTH_MIN;
    surface.querySelectorAll<HTMLElement>(`[data-col="${colKey}"]`).forEach((cell) => {
      // A truncate child still reports its full text width via scrollWidth.
      const inner = cell.firstElementChild as HTMLElement | null;
      const content = Math.max(cell.scrollWidth, inner?.scrollWidth ?? 0);
      max = Math.max(max, content + FIT_SLACK_PX);
    });
    onCommit(clampColumnWidth(max));
  }, [colKey, onCommit]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const cell = cellOf(ref.current);
      const surface = surfaceOf(ref.current);
      if (!cell || !surface) return;
      const startX = e.clientX;
      const startW = cell.getBoundingClientRect().width;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Local closures capture the live `onCommit` + start metrics, so the same
      // function refs add/remove cleanly (no stale-listener leak).
      const move = (ev: PointerEvent) => {
        surface.style.setProperty(
          gridColVar(colKey),
          `${clampColumnWidth(startW + (ev.clientX - startX))}px`,
        );
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        onCommit(clampColumnWidth(startW + (ev.clientX - startX)));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [colKey, onCommit],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const cell = cellOf(ref.current);
      if (!cell) return;
      const w = cell.getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onCommit(clampColumnWidth(w - NUDGE_PX));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onCommit(clampColumnWidth(w + NUDGE_PX));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resizeToFit();
      }
    },
    [onCommit, resizeToFit],
  );

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`Resize ${label} column`}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        resizeToFit();
      }}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'ds-raw-button absolute -right-1 top-0 z-raised flex h-full w-2 cursor-col-resize touch-none items-stretch justify-center',
        'opacity-0 transition-opacity duration-100 group-hover/hcell:opacity-100 focus-visible:opacity-100',
        focusRing('control', 'accent'),
      )}
    >
      <span className="my-1 w-px rounded bg-border-strong" aria-hidden />
    </button>
  );
}
