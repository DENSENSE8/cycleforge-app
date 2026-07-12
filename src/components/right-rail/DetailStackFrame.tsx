'use client';

/**
 * Detail stack layout tokens + shared aside surface classes.
 * Motion/backdrop live in `RightRailHost` so `AnimatePresence` can own
 * direct `motion.*` children (required for exit animations).
 */

import type { CSSProperties } from 'react';

/** Shared layout tokens — one place to tune inset / width / header offset. */
export const DETAIL_STACK_LAYOUT = {
  widthPx: 420,
  /** Uniform floating gap from the viewport edges on all four sides. */
  insetPx: 12,
  /** Matches global header band (`z-header` / `top-[40px]`). */
  headerOffsetPx: 40,
} as const;

export function detailStackAsideStyle(): CSSProperties {
  const { insetPx, widthPx } = DETAIL_STACK_LAYOUT;
  // Floats near the top-right of the viewport with an even gap on every side —
  // ABOVE the (backdrop-dimmed) global header, not below it. `top: insetPx`
  // moves it up; `right: insetPx` pulls it in off the flush edge (over to the
  // left); `bottom: insetPx` keeps a matching gap so the padding wraps the whole
  // card. Height fills top→bottom within those insets.
  return {
    top: insetPx,
    right: insetPx,
    bottom: insetPx,
    width: `min(${widthPx}px, calc(100vw - ${insetPx * 2}px))`,
  };
}

export const detailStackAsideClassName =
  'fixed z-panel flex flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-2xl';

/** Full-height dock for the persistent assistant (⌘J) — flush right edge, no inset card. */
export function assistantDockAsideStyle(): CSSProperties {
  const { headerOffsetPx, widthPx } = DETAIL_STACK_LAYOUT;
  return {
    top: headerOffsetPx,
    right: 0,
    bottom: 0,
    width: `min(${widthPx}px, 100vw)`,
  };
}

export const assistantDockAsideClassName =
  'fixed z-panel flex flex-col overflow-hidden border-l border-border-soft bg-surface-card shadow-xl';
