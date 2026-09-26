'use client';

/** Rail/card hover preview — a thin naming layer over {@link useHoverSurface}, which is the ONE hover-open engine… */

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
