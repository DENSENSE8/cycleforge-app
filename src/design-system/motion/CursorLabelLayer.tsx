'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import {
  motion,
  useMotionValue,
  usePointerFine,
  useReducedMotion,
} from '@/design-system/motion';
import { TooltipChipBody, tooltipChipClass } from '@/design-system/primitives/TooltipChip';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  readCursorLabel,
  readCursorLabelServer,
  setCursorLabelHost,
  subscribeCursorLabel,
} from './cursor-label';

/**
 * CursorLabelLayer — the desk's tooltip FOLLOWER, ported from mainline's `MorphCursorLayer` 2026-09-15 with the custom cursor LEFT BEHIND…
 * (operator 2026-09-15: "update the tooltip on hover to have a proper corner
 */

/** Tooltip chip seat: just below-right of the hotspot, clear of the OS pointer. */
const LABEL_DX = 14;
const LABEL_DY = 18;
/** Viewport breathing room — same margin the anchored bubble keeps. */
const LABEL_MARGIN = 8;

/** Snap a CSS-px offset onto the DEVICE-pixel grid. */
function snapToDevicePixel(value: number): number {
  const dpr = (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1;
  return Math.round(value * dpr) / dpr;
}

export function CursorLabelLayer() {
  const fine = usePointerFine();
  const reduceMotion = useReducedMotion();
  const enabled = fine && !reduceMotion;

  const cursorLabel = useSyncExternalStore(
    subscribeCursorLabel,
    readCursorLabel,
    readCursorLabelServer,
  );
  const tooltip = cursorLabel?.text ?? null;
  // The chord a trigger published with its label (`HoverTooltip shortcut`).
  // Dropping it here hid every tooltip shortcut on desktop, where the label
  // rides the cursor instead of the anchored bubble.
  const chord = cursorLabel?.keys ?? null;

  // Tell triggers a follower exists to carry their label. Off → they fall
  // back to the anchored HoverTooltip bubble (floor, touch, reduced motion).
  useEffect(() => {
    setCursorLabelHost(enabled);
    return () => setCursorLabelHost(false);
  }, [enabled]);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);

  // Tooltip chip offset from the hotspot. Re-seated on every pointer frame
  // and whenever the chip is re-measured: flips left of the pointer when it
  // would clip the right edge, above it when it would clip the bottom.
  const labelX = useMotionValue(LABEL_DX);
  const labelY = useMotionValue(LABEL_DY);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const chipSizeRef = useRef({ w: 0, h: 0 });
  const lastPointRef = useRef({ x: 0, y: 0 });
  const seatLabel = useCallback(
    (clientX: number, clientY: number) => {
      lastPointRef.current = { x: clientX, y: clientY };
      const { w, h } = chipSizeRef.current;
      if (!w || !h) return;
      const fitsRight = clientX + LABEL_DX + w <= window.innerWidth - LABEL_MARGIN;
      const fitsBelow = clientY + LABEL_DY + h <= window.innerHeight - LABEL_MARGIN;
      labelX.set(snapToDevicePixel(fitsRight ? LABEL_DX : -(w + LABEL_MARGIN)));
      labelY.set(snapToDevicePixel(fitsBelow ? LABEL_DY : -(h + LABEL_MARGIN)));
    },
    [labelX, labelY],
  );
  useLayoutEffect(() => {
    const chip = chipRef.current;
    if (!chip) {
      chipSizeRef.current = { w: 0, h: 0 };
      return;
    }
    const box = chip.getBoundingClientRect();
    chipSizeRef.current = { w: box.width, h: box.height };
    seatLabel(lastPointRef.current.x, lastPointRef.current.y);
    // Keyed on the painted TEXT — a different label is a different size, and
    // the edge flip has no size to work with until it is measured.
  }, [tooltip, seatLabel]);

  // The follow never lags: the follower sits directly on the pointer event,
  // no spring, no trail.
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: MouseEvent) => {
      x.set(snapToDevicePixel(e.clientX));
      y.set(snapToDevicePixel(e.clientY));
      seatLabel(e.clientX, e.clientY);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [enabled, x, y, seatLabel]);

  if (!enabled) return null;

  return createPortal(
    <motion.div
      aria-hidden
      data-testid="cursor-label-layer"
      className="pointer-events-none fixed left-0 top-0 z-tooltip"
      style={{ x, y, willChange: 'transform' }}
    >
      {tooltip ? (
        <motion.span
          ref={chipRef}
          data-testid="cursor-label-chip"
          style={{ x: labelX, y: labelY }}
          className={cn(DROPDOWN_SHELL_CORNER, 'absolute left-0 top-0', tooltipChipClass({ row: chord != null }))}
        >
          <TooltipChipBody label={tooltip} chord={chord} />
        </motion.span>
      ) : null}
    </motion.div>,
    document.body,
  );
}
