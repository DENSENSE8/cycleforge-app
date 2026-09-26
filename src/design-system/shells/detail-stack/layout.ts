import type { CSSProperties } from 'react';
import { TOP_CHROME_ROW_PX } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

/** Shared layout tokens — one place to tune inset / width / header offset. */
export const DETAIL_STACK_LAYOUT = {
  widthPx: 420,
  /** Uniform floating gap from the viewport edges on all four sides. */
  insetPx: 12,
  /** Matches GlobalHeader band — compose {@link TOP_CHROME_ROW_PX}. */
  headerOffsetPx: TOP_CHROME_ROW_PX,
} as const;

/** Drag-to-resize contract for NON-MODAL detail inspectors (dashboard order inspector, receiving More details). */
export const DETAIL_STACK_RESIZE = {
  storageKey: 'detail-inspector-width',
  defaultWidthPx: DETAIL_STACK_LAYOUT.widthPx,
  minWidthPx: 360,
  maxWidthPadPx: 960,
} as const;

/** Collapse contract for NON-MODAL detail inspectors on {@link RightRailHost}. */
export const DETAIL_STACK_COLLAPSE = {
  storageKey: 'detail-inspector-collapsed',
  /** Slim expand strip width when the inspector is parked (Tailwind twin: `w-8`). */
  stripWidthPx: 32,
} as const;

/** @param widthPx overrides the fixed default (resizable non-modal inspectors). */
export function detailStackAsideStyle(widthPx?: number): CSSProperties {
  const { insetPx, widthPx: defaultWidthPx } = DETAIL_STACK_LAYOUT;
  const width = widthPx ?? defaultWidthPx;
  // Floats near the top-right of the viewport with an even gap on every side — ABOVE the (backdrop-dimmed) global header, not below it.
  return {
    top: insetPx,
    right: insetPx,
    bottom: insetPx,
    width: `min(${width}px, calc(100vw - ${insetPx * 2}px))`,
  };
}

/**
 * Parked expand strip when a non-modal detail inspector is collapsed.
 * Fixed chrome on the right edge — not a second white card.
 */
export function detailStackCollapseStripClassName(elevated = false): string {
  return cn(
    'fixed flex w-8 flex-col items-center pt-3',
    elevated ? 'z-detailStack' : 'z-panel',
  );
}

export function detailStackCollapseStripStyle(): CSSProperties {
  const { insetPx } = DETAIL_STACK_LAYOUT;
  return {
    top: insetPx,
    right: insetPx,
    bottom: insetPx,
  };
}

/**
 * The detail-stack aside surface shell — elevated float recipe for modal /
 * overlay inspectors and the **narrow-viewport** Unbox push exception.
 * In-flow flush push columns use {@link DETAIL_STACK_PUSH_COLUMN_CLASS} instead.
 */
const DETAIL_STACK_ASIDE_SURFACE =
  'isolate flex flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-2xl shadow-scrim/40';

/** The IN-FLOW flush push column — right-edge mirror of {@link CONTEXT_PANEL_COLUMN_CLASS} (ruled 2026-08-03 exact flush planes). */
export const DETAIL_STACK_PUSH_COLUMN_CLASS = cn(
  'relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden',
  'border-l border-border-soft bg-surface-card',
);

/**
 * Parked push column — the in-flow twin of
 * {@link detailStackCollapseStripClassName}. Same 32px strip, flush on the
 * shared ground (no outer margin island).
 */
export const DETAIL_STACK_PUSH_STRIP_CLASS =
  'relative flex h-full w-8 shrink-0 flex-col items-center border-l border-border-soft bg-surface-card pt-3';

/** Right-rail **industrial flush** body host (Cybertruck / WMS instrument plane). */
export const DISPLAYS_FLUSH_HOST = cn(
  'flex h-full min-h-0 flex-col overflow-hidden px-0 pt-0',
);

/** Opt-in readable gutter for right-rail body **content rows** under {@link DISPLAYS_FLUSH_HOST}. */
export const DISPLAYS_BODY_INSET = 'px-4';

/** Default detail stack — panel band (`z-panel`). */
export const detailStackAsideClassName = `fixed z-panel ${DETAIL_STACK_ASIDE_SURFACE}`;

/** Elevated variant — sits in the dedicated `detailStack` band (above a workbench workspace overlay + its popovers, below modals). */
export const detailStackAsideElevatedClassName = `fixed z-detailStack ${DETAIL_STACK_ASIDE_SURFACE}`;
/** Viewport backdrop behind a detail stack. */
export const detailStackBackdropClassName =
  'fixed inset-0 z-panelBackdrop bg-scrim/55 backdrop-blur-[2px]';

export const detailStackBackdropElevatedClassName =
  'fixed inset-0 z-detailStackBackdrop bg-scrim/70 backdrop-blur-md';

/** Invisible dismiss layer for NON-MODAL inspectors that still want click-off close (receiving details). */
export const detailStackDismissLayerClassName = 'fixed inset-0 z-panelBackdrop';

export const detailStackDismissLayerElevatedClassName =
  'fixed inset-0 z-detailStackBackdrop';

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
