/**
 * Warehouse Labels / Bays label-builder layout pin.
 *
 * Callers: StepPills (bin+rack), Bin/Rack builders, LabelPrintWorkspace.
 * No data schemas. Adds LABEL_BUILDER_STEP path chips (distinct from TabSwitch).
 * User: "tabs and the pills are from different tokens" / "Reset button must
 * have an outline" / improve legibility and navigation.
 */

import { cornerClass } from '@/design-system/tokens/radius';

export const LABEL_BUILDER = {
  /** Inner content column — matches StickyActionBar default. */
  contentMax: 'max-w-3xl',
  contentShell: 'mx-auto w-full max-w-3xl',
  /**
   * Page gutter around Labels/Bays main panes. Top only — the sticky
   * print bar bleeds to the card floor (`actionBleed`). Horizontal inset
   * matches StickyActionBar's compact `innerGutter`.
   */
  pagePad: 'px-4 pt-3 sm:px-6',
  /** Cancels `pagePad` horizontal inset so the print bar is full-bleed. */
  actionBleed: '-mx-4 sm:-mx-6',
  /** Vertical rhythm inside the builder column. */
  stackGap: 'stack-row',
} as const;

/** Quiet selected chrome — solid / soft, no blue gradients. */
export const LABEL_BUILDER_SELECTED = {
  /** Numpad pad / step path chip active. */
  solid:
    'border-blue-600 bg-blue-600 text-white shadow-none',
  /** Soft selected (room row, custom tile focus). */
  soft: 'border-blue-300 bg-blue-50/80 text-blue-900 ring-1 ring-blue-200',
  /** Done-but-inactive step path chip. */
  done: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
} as const;

/**
 * Location drill-down path chrome — NOT TabSwitch.
 * Surface corners + outlined idle chips so the path reads as a breadcrumb,
 * while Single|Bulk stays on the segmented TabSwitch track.
 */
export const LABEL_BUILDER_STEP = {
  track: `flex w-full min-w-0 overflow-x-scroll overflow-y-hidden overscroll-x-contain ${cornerClass('surface')} bg-surface-sunken/40 px-1.5 py-1.5 ring-1 ring-border-soft [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden`,
  chipBase: `ds-raw-button flex h-8 shrink-0 items-center gap-1.5 ${cornerClass('surface')} border px-2.5 text-role-caption font-semibold transition-colors`,
  chipIdle: 'border-border-soft bg-surface-card text-text-faint cursor-not-allowed',
  chipActive: LABEL_BUILDER_SELECTED.solid,
  chipDone: `${LABEL_BUILDER_SELECTED.done} cursor-pointer`,
} as const;

/** Desktop ops sizing for numeric quick-picks. */
export const LABEL_BUILDER_NUMPAD = {
  grid: 'grid max-w-md grid-cols-5 gap-1.5',
  tile: 'relative flex h-11 flex-col items-center justify-center rounded-xl border text-center transition-colors',
  tileLabel: 'font-mono text-sm font-semibold tabular-nums tracking-tight',
  customTile:
    'relative flex h-11 min-w-0 items-center rounded-xl border border-dashed bg-surface-card px-2 transition-colors',
  customInput:
    'h-full w-full min-w-0 bg-transparent pr-1 text-center font-mono text-sm font-semibold tabular-nums tracking-tight text-text-default outline-none placeholder:text-role-caption placeholder:font-medium placeholder:tracking-wide placeholder:text-text-faint [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
} as const;
