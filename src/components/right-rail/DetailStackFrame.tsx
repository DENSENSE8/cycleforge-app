'use client';

/**
 * Detail stack layout tokens + shared aside surface classes.
 * Motion/backdrop live in `RightRailHost` so `AnimatePresence` can own
 * direct `motion.*` children (required for exit animations).
 */

import type { CSSProperties } from 'react';

/** Shared layout tokens — one place to tune width / header offset. */
export const DETAIL_STACK_LAYOUT = {
  widthPx: 420,
  /** Matches global header band (`z-header` / `top-[40px]`). */
  headerOffsetPx: 40,
} as const;

export function detailStackAsideStyle(): CSSProperties {
  const { headerOffsetPx, widthPx } = DETAIL_STACK_LAYOUT;
  // Flush under the global header (no top gap) and edge-to-edge to the viewport
  // bottom/right so the panel displays full height. Rounded left edge keeps the
  // soft flyout feel without a floating inset card.
  return {
    top: headerOffsetPx,
    right: 0,
    bottom: 0,
    width: `min(${widthPx}px, 100vw)`,
  };
}

export const detailStackAsideClassName =
  'fixed z-panel flex flex-col overflow-hidden rounded-l-2xl border-l border-border-soft bg-surface-card shadow-xl';

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
