'use client';

/**
 * Rail/card hover preview — a thin naming layer over {@link useHoverSurface},
 * which is the ONE hover-open engine (`src/hooks/useHoverSurface.ts`).
 *
 * This file used to own its own open/close timers and its own module-scope
 * "one at a time" registry. Both moved to the shared hook, so the rail, the
 * carton bar's classify menus, and the chip menus now share one timing contract
 * (`HOVER_DELAYS`: 0ms open, 150ms close) and one eviction rule. Do not
 * reintroduce timers here — a fifth engine is exactly what the consolidation
 * removed.
 *
 * The public shape is unchanged so the existing call sites did not move.
 *
 * Pair with {@link RailPopover} for positioning. Used by `RailRow` (the
 * recent-activity rail) and the parked collapse-strip pins, so the shipping
 * sidebar's hover preview behaves identically to the receiving/testing rail's.
 *
 * Usage:
 *   const preview = useRailHoverPreview({ enabled: Boolean(renderPopover) });
 *   <div ref={anchorRef} {...preview.hoverProps}>…</div>
 *   {preview.isOpen && (
 *     <RailPopover anchorEl={anchorRef.current}
 *       onMouseEnter={preview.scheduleOpen} onMouseLeave={preview.scheduleClose}
 *       onDismiss={preview.dismiss}>…</RailPopover>
 *   )}
 *
 * Do NOT wrap it in `AnimatePresence` — the popover has no exit animation, so
 * the wrapper only adds a presence subtree that defers the unmount.
 */

import { HOVER_DELAYS, useHoverSurface } from '@/hooks/useHoverSurface';

export function useRailHoverPreview(
  opts: { enabled?: boolean; closeDelay?: number } = {},
) {
  const { enabled = true, closeDelay = HOVER_DELAYS.CLOSE_MS } = opts;
  const { isOpen, open, close, scheduleClose, clearCloseTimer } = useHoverSurface({
    disabled: !enabled,
    closeMs: closeDelay,
  });

  return {
    isOpen,
    hoverProps: { onMouseEnter: open, onMouseLeave: scheduleClose },
    /** Also cancels a pending close — the popover reuses this on mouse-enter. */
    scheduleOpen: () => {
      clearCloseTimer();
      open();
    },
    scheduleClose,
    dismiss: close,
  };
}
