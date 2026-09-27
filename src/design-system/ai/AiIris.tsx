'use client';

/**
 * The iridescent accent — the ONE place the AI's colour appears, and only
 * while it is working (operator interview 2026-09-26).
 *
 * {@link AiTextShimmer} — the live thinking line ("Thinking…", "Checking bin
 * C-03-12-3…"): the words sit in the quiet ink, and an iris band sweeps across
 * the GLYPHS left to right (operator 2026-09-27: a working turn reads as one
 * calm shimmering line — no spinner, no rainbow composer edge).
 *
 * Transform only: the band is a clipping window that slides right while the
 * iris copy of the text inside it slides left by the same amount, so the
 * glyphs hold still and only the lit window moves — compositor time, no paint.
 * Reduced motion: the words stay, the sweep stops.
 */

import { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { aiTransition } from './motion';

/** The lit window's soft edges — static, so it moves with the window. */
const BAND_MASK = 'linear-gradient(90deg, transparent 0%, black 40%, black 60%, transparent 100%)';

export function AiTextShimmer({ children, className }: { children: string; className?: string }) {
  const reduced = useReducedMotion();
  // Window position in % of the line: -100 (parked left) → 100 (parked right).
  const sweep = useMotionValue(-100);
  const windowX = useTransform(sweep, (v) => `${v}%`);
  const textX = useTransform(sweep, (v) => `${-v}%`);
  useEffect(() => {
    if (reduced) return;
    const controls = animate(sweep, [-100, 100], aiTransition.shimmer);
    return () => controls.stop();
  }, [reduced, sweep]);

  return (
    <span className={cn('relative inline-block max-w-full overflow-hidden whitespace-nowrap align-top text-ai-muted', className)}>
      {children}
      {reduced ? null : (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none overflow-hidden"
          style={{ x: windowX, maskImage: BAND_MASK, WebkitMaskImage: BAND_MASK }}
        >
          <motion.span className="absolute inset-0 bg-ai-iris bg-clip-text text-transparent" style={{ x: textX }}>
            {children}
          </motion.span>
        </motion.span>
      )}
    </span>
  );
}
