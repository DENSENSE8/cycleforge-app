'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cornerClass } from '@/design-system/tokens/radius';
import { zIndex as zLayer } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

/**
 * Generic hover-preview popover positioning wrapper. Handles portal, viewport
 * flipping, resize/scroll reflow, and Escape-to-dismiss. Content is supplied
 * by the caller via children.
 *
 * Flush against the rail row (GAP 0) + squared chrome — no floating gutter or
 * soft card radius between the recent rail and the hover display.
 *
 * The card REVEALS INSTANTLY — no motion, and `useRailHoverPreview` opens it
 * with a 0ms delay. This is a navigator on a scan bench: the operator is
 * reaching for a row they already know, so any duration sits between the reach
 * and the target (same ruling as the MasterNav spine, which imports no motion
 * at all — `display/motion-crossfade.md` → *the MasterNav spine has NO motion*).
 * The spring + `x`/`scale` travel this used to run also made the peek arrive
 * from the side while the pointer was already on the row it describes.
 */
export function RailPopover({
  anchorEl, onMouseEnter, onMouseLeave, onDismiss, children,
}: {
  anchorEl: HTMLElement | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const POPOVER_WIDTH = 320;
  const POPOVER_FALLBACK_HEIGHT = 440;
  const VIEWPORT_PADDING = 8;
  /** Flush to the rail edge — no air between row highlight and display. */
  const GAP = 0;
  const [coords, setCoords] = useState<{ left: number; top: number; flipped: boolean } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const measurePosition = useCallback(() => {
    if (!anchorEl) return null;
    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const flipped = vw - rect.right < POPOVER_WIDTH + GAP + 12;
    const left = flipped
      ? Math.max(VIEWPORT_PADDING, rect.left - POPOVER_WIDTH - GAP)
      : Math.min(vw - POPOVER_WIDTH - VIEWPORT_PADDING, rect.right + GAP);
    const popH = popoverRef.current?.getBoundingClientRect().height ?? POPOVER_FALLBACK_HEIGHT;
    const maxTop = Math.max(VIEWPORT_PADDING, vh - popH - VIEWPORT_PADDING);
    const top = Math.max(VIEWPORT_PADDING, Math.min(rect.top, maxTop));
    return { left, top, flipped };
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!anchorEl) {
      setCoords(null);
      return;
    }
    const apply = () => { const next = measurePosition(); if (next) setCoords(next); };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('scroll', apply, true);
    return () => { window.removeEventListener('resize', apply); window.removeEventListener('scroll', apply, true); };
  }, [anchorEl, measurePosition]);

  const previewVisible = coords !== null;
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!anchorEl || !previewVisible || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { const next = measurePosition(); if (next) setCoords(next); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchorEl, previewVisible, measurePosition]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (typeof document === 'undefined' || !coords) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ position: 'fixed', top: coords.top, left: coords.left, width: POPOVER_WIDTH, zIndex: zLayer.panelPopover }}
      className={cn(
        cornerClass('flush'),
        'border border-border-soft bg-surface-card',
        // Cast the overlay ink AWAY from the rail. The card is flush (GAP 0)
        // against the row it describes, so an all-round `shadow-2xl` threw its
        // heaviest layer straight back onto the rail — the one surface it must
        // not dim. `shadow-elev-overlay-{left,right}` is the house directional
        // token (`tokens/shadows.ts`); its zero-offset ambient layer stays, so
        // the flush edge keeps a hairline read instead of a dark gutter.
        coords.flipped ? 'shadow-elev-overlay-left' : 'shadow-elev-overlay-right',
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
