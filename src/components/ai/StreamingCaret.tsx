'use client';

/**
 * StreamingCaret — the live-generation caret for assistant prose.
 *
 * The 2026 chat standard: a caret that BREATHES (easeInOut opacity + scaleY
 * loop on `motionRole.chat.stream`), not Tailwind's `animate-pulse` — a flat
 * 50%-duty square wave reads as a blink, and a blinking cursor on a surface
 * someone stares at all day is a strobe, not a heartbeat.
 *
 * Physics lives in the catalog (`framerTransition.chatCaretBreath`); this
 * component owns only the paint. Color is `text-info` (Scan Blue) — under the
 * One-Voice rule that hue means "a live fact is arriving", which is exactly
 * what a streaming caret is.
 *
 * Reduced motion: a steady half-opacity bar. It still marks where text will
 * land — that is information — without any oscillation.
 */

import { motion, motionRole, useReducedMotion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';

export function StreamingCaret({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <span
        aria-hidden
        className={cn('inline-block h-4 w-0.5 rounded-full bg-text-info/50 align-middle', className)}
      />
    );
  }
  return (
    <motion.span
      aria-hidden
      className={cn('inline-block h-4 w-0.5 rounded-full bg-text-info align-middle', className)}
      initial={{ opacity: 0.25, scaleY: 0.8 }}
      animate={{ opacity: [0.25, 1, 0.25], scaleY: [0.8, 1, 0.8] }}
      transition={motionRole.chat.stream.transition}
      style={{ originY: '0.65' }}
    />
  );
}
