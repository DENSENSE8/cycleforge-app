'use client';

/**
 * THE QUEUE PANE'S WIDTH — pure math plus the drag hook.
 *
 * The math is COPIED, not imported, from
 * `src/design-system/hooks/useHorizontalEdgeResize.ts`. That module has
 * good, unit-tested functions and a doomed address: the `src/design-system`
 * tree is being deleted by a parallel lane, and its test file is already red
 * on a missing `@/components/sidebar/context-panel-column`. Importing into
 * the shell from a directory scheduled for deletion buys a broken build on
 * whatever day that lane lands. Forty lines, copied, with the provenance
 * written down.
 *
 * NO MOTION HERE, DELIBERATELY. The drag is a width change — the one thing
 * M1 has never permitted anything to tween, and the one thing the feedback
 * ruling explicitly carved out ("do not animate layout... no motion-driven
 * width transitions"). The width is applied as a single inline style value,
 * which is also the sole `style=` prop the ruling allows.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** The queue column's clamp. Below 280 a work-order card cannot show its
 *  reference and its subtitle on one line; above 480 it stops being a
 *  column and starts stealing the work surface. */
export const QUEUE_MIN_PX = 280;
export const QUEUE_MAX_PX = 480;
export const QUEUE_DEFAULT_PX = 360;

/**
 * Pure drag math. The queue is RIGHT-anchored, so its handle is on the
 * LEADING (left) edge: dragging left grows it, dragging right shrinks it.
 */
export function widthFromLeadingDrag(startWidth: number, startX: number, clientX: number): number {
  return startWidth - (clientX - startX);
}

/** Clamp to the column's own range AND to what the viewport can spare. */
export function clampQueueWidth(raw: number, viewportWidth?: number): number {
  const viewportCap =
    viewportWidth == null ? QUEUE_MAX_PX : Math.max(QUEUE_MIN_PX, viewportWidth - 640);
  const cap = Math.min(QUEUE_MAX_PX, viewportCap);
  if (!Number.isFinite(raw)) return QUEUE_DEFAULT_PX;
  return Math.max(QUEUE_MIN_PX, Math.min(cap, raw));
}

/**
 * LOCAL STATE, ON PURPOSE.
 *
 * The durable home would be `staff_preferences.prefs.workspace`, but that
 * schema (`src/lib/workspace/prefs-schema.ts`) is `.strict()`, so a new key
 * is rejected at validation until it is added there — and `useShell` imports
 * none of the persistence helpers today, so the shell persists nothing at
 * all yet. Wiring one pref through would mean wiring the round-trip, and the
 * server merge is shallow (`prefs || patch`), so a partial write silently
 * drops `openTabs`. That is its own change, not a rider on this one.
 *
 * TODO: promote to `staff_preferences.prefs.workspace.queueWidth` — needs a
 * `WorkspacePrefs` schema entry, and every write must send the WHOLE
 * workspace sub-map (shallow merge).
 */
export function useQueuePaneWidth() {
  const [width, setWidth] = useState(QUEUE_DEFAULT_PX);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      drag.current = { startX: e.clientX, startWidth: width };
      setDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!dragging) return;

    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setWidth(
        clampQueueWidth(widthFromLeadingDrag(d.startWidth, d.startX, e.clientX), window.innerWidth),
      );
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    /* The drag must survive the pointer leaving the window, and it must
       not paint a text caret over every element it crosses. */
    const priorSelect = document.body.style.userSelect;
    const priorCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.style.userSelect = priorSelect;
      document.body.style.cursor = priorCursor;
    };
  }, [dragging]);

  /* Keyboard parity — a divider reachable only by pointer is not a
     control on a workstation where the operator's hands are on the gun. */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setWidth((w) => clampQueueWidth(w + step, window.innerWidth));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setWidth((w) => clampQueueWidth(w - step, window.innerWidth));
    }
  }, []);

  return { width, dragging, onPointerDown, onKeyDown };
}
